import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal in-memory stand-in for the Supabase query builder: just enough of
// select/eq/single/update/delete/insert for the pending-change actions.
type Row = Record<string, unknown>;
const db: Record<string, Row[]> = { events: [], events_pending: [] };
const writes: string[] = [];

class FakeQuery {
  private filters: [string, unknown][] = [];
  private op: "select" | "update" | "delete" | "insert" = "select";
  private payload: Row = {};
  private returning = false;

  constructor(private table: string) {}

  select() {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  insert(payload: Row) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  async single() {
    const rows = db[this.table].filter((r) => this.matches(r));
    return rows.length === 1
      ? { data: structuredClone(rows[0]), error: null }
      : { data: null, error: { message: "not found" } };
  }
  // Awaitable like the real builder.
  then(...args: Parameters<Promise<{ data: unknown; error: null }>["then"]>) {
    return this.run().then(...args);
  }

  private matches(row: Row) {
    return this.filters.every(([c, v]) => row[c] === v);
  }
  private async run() {
    const rows = db[this.table];
    writes.push(`${this.op} ${this.table}`);
    if (this.op === "insert") {
      rows.push(structuredClone(this.payload));
      return { data: null, error: null };
    }
    if (this.op === "update") {
      rows.filter((r) => this.matches(r)).forEach((r) => Object.assign(r, this.payload));
      return { data: null, error: null };
    }
    if (this.op === "delete") {
      const removed = rows.filter((r) => this.matches(r));
      db[this.table] = rows.filter((r) => !this.matches(r));
      return { data: this.returning ? removed : null, error: null };
    }
    return { data: rows.filter((r) => this.matches(r)), error: null };
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => new FakeQuery(table),
    auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
  }),
}));

const { approveChange } = await import("./pending");

const baseEvent = {
  id: "e1",
  title: "Old title",
  venue_name: "Old venue",
  start_datetime: "2026-07-01T00:00:00+00:00",
  age_categories: ["u8", "u10"],
  approved: true,
  created_by: "org-1",
};

function suggest(diff: Row, id = "p1") {
  db.events_pending.push({ id, duplicate_of: "e1", title: "Old title", diff_against: diff });
}

// approveChange redirects on success, which Next implements by throwing.
async function approve(id = "p1") {
  try {
    return await approveChange(id, "/admin/pending");
  } catch (e) {
    if (String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) return "redirected";
    throw e;
  }
}

beforeEach(() => {
  db.events = [structuredClone(baseEvent)];
  db.events_pending = [];
  writes.length = 0;
});

describe("approveChange", () => {
  it("applies the suggested fields and clears the pending row", async () => {
    suggest({ title: { from: "Old title", to: "New title" }, _note: { from: null, to: "typo" } });
    expect(await approve()).toBe("redirected");
    expect(db.events[0]).toMatchObject({ title: "New title", updated_by: "admin-1" });
    expect(db.events_pending).toHaveLength(0);
  });

  it("ignores columns outside the event form, even if smuggled into the diff", async () => {
    suggest({
      title: { from: "Old title", to: "X" },
      approved: { from: true, to: false },
      created_by: { from: "org-1", to: "attacker" },
    });
    expect(await approve()).toBe("redirected");
    expect(db.events[0]).toMatchObject({ title: "X", approved: true, created_by: "org-1" });
  });

  it("refuses to overwrite an edit made after the suggestion, and keeps it queued", async () => {
    db.events[0].title = "Edited by organiser";
    suggest({ title: { from: "Old title", to: "Suggested" } });
    const result = await approve();
    expect(result).toEqual({ error: expect.stringMatching(/edited since.*title/) });
    expect(db.events[0].title).toBe("Edited by organiser");
    expect(db.events_pending).toHaveLength(1);
  });

  it("compares timestamps as instants, not strings", async () => {
    suggest({ start_datetime: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-02T00:00:00.000Z" } });
    expect(await approve()).toBe("redirected");
    expect(db.events[0].start_datetime).toBe("2026-07-02T00:00:00.000Z");
  });

  it("compares age categories regardless of order", async () => {
    suggest({ age_categories: { from: ["u10", "u8"], to: ["u8", "u10", "u12"] } });
    expect(await approve()).toBe("redirected");
    expect(db.events[0].age_categories).toEqual(["u8", "u10", "u12"]);
  });

  it("clears an already-applied suggestion without touching the event", async () => {
    db.events[0].title = "Suggested";
    suggest({ title: { from: "Old title", to: "Suggested" } });
    expect(await approve()).toBe("redirected");
    expect(writes).not.toContain("update events");
    expect(db.events_pending).toHaveLength(0);
  });

  it("only applies a suggestion once when approved twice", async () => {
    suggest({ title: { from: "Old title", to: "New" } });
    expect(await approve()).toBe("redirected");
    expect(await approve()).toEqual({ error: expect.stringMatching(/not found|already/) });
    expect(writes.filter((w) => w === "update events")).toHaveLength(1);
  });

  it("reports a missing target event instead of throwing", async () => {
    db.events = [];
    suggest({ title: { from: "Old title", to: "New" } });
    expect(await approve()).toEqual({ error: expect.stringMatching(/no longer exists/) });
  });
});
