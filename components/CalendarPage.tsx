"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Search, X, Rss, ArrowUpRight } from "lucide-react";
import RouteLine from "./RouteLine";
import { EVENT_DISCIPLINES, EVENTS, eventDisc, ageLabel, type DisciplineId, type CalendarEvent } from "@/lib/mock-data";
import { MONTHS, fmtDay } from "@/lib/format";

export default function CalendarPage() {
  const [activeDisc, setActiveDisc] = useState<Set<DisciplineId>>(new Set());
  const [region, setRegion] = useState("all");
  const [search, setSearch] = useState("");

  const toggleDisc = (id: DisciplineId) =>
    setActiveDisc((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const filtered = useMemo(
    () =>
      EVENTS.filter((e) => {
        if (activeDisc.size > 0 && !activeDisc.has(e.discipline)) return false;
        if (region !== "all" && e.region !== region) return false;
        if (search && !`${e.title} ${e.venue}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }).sort((a, b) => a.date.localeCompare(b.date)),
    [activeDisc, region, search]
  );

  const grouped = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {};
    filtered.forEach((e) => {
      const d = new Date(e.date + "T00:00:00");
      const key = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      (m[key] = m[key] || []).push(e);
    });
    return m;
  }, [filtered]);

  return (
    <>
      <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 0" }}>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>DEVON &amp; CORNWALL — AGES 5 TO 16</div>
        <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 60px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
          One calendar for all cycling races and events across the Southwest
        </h1>
        <p style={{ maxWidth: 480, fontSize: 16, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
          Every Under 8s–16s race and club cluster session across Devon and Cornwall — Cross Country mountain biking, cyclocross, road, triathlon in one calendar.
        </p>
        <div style={{ display: "flex", gap: 28, alignItems: "flex-start", marginTop: 30, flexWrap: "wrap" }}>
          <div>
            <a href="/calendar.ics" style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "13px 24px", fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <Rss size={15} /> Subscribe to calendar
            </a>
            <div className="mono" style={{ fontSize: 10.5, color: "#9A9992", marginTop: 8 }}>Add the live calendar to your phone&apos;s calendar</div>
          </div>
          <Link href="/getting-started" style={{ fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, borderBottom: "1px solid #111111", paddingBottom: 2, marginTop: 13 }}>
            New to racing? Start here <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="mono" style={{ display: "flex", gap: 40, marginTop: 44, fontSize: 11.5, color: "#6B6B66" }}>
          <div><span className="disp" style={{ fontSize: 26, color: "#111111", display: "block" }}>{EVENTS.length}</span>EVENTS TRACKED</div>
          <div><span className="disp" style={{ fontSize: 26, color: "#111111", display: "block" }}>5–16</span>AGE RANGE</div>
          <div><span className="disp" style={{ fontSize: 26, color: "#111111", display: "block" }}>2</span>COUNTIES</div>
        </div>
        <div style={{ marginTop: 40 }}><RouteLine /></div>
      </header>

      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "#FAFAF8", borderTop: "1px solid #E4E2DD", borderBottom: "1px solid #E4E2DD", padding: "16px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="mono" style={{ fontSize: 10.5, color: "#9A9992", marginRight: 2 }}>DISCIPLINE</span>
            {EVENT_DISCIPLINES.map((d) => {
              const active = activeDisc.has(d.id);
              return (
                <button key={d.id} onClick={() => toggleDisc(d.id)}
                  style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 999, border: `1px solid ${active ? d.color : "#D8D6D0"}`, background: active ? d.color : "transparent", color: active ? "#FAFAF8" : "#4A4A46", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "#FAFAF8" : d.color }} />
                  {d.label}
                </button>
              );
            })}
            {activeDisc.size > 0 && (
              <button onClick={() => setActiveDisc(new Set())} className="mono" style={{ fontSize: 11, color: "#6B6B66", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>CLEAR</button>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", border: "1px solid #D8D6D0" }}>
              {[["all", "ALL"], ["devon", "DEVON"], ["cornwall", "CORNWALL"]].map(([val, label]) => (
                <button key={val} onClick={() => setRegion(val)} className="mono" style={{ padding: "8px 15px", fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", background: region === val ? "#111111" : "transparent", color: region === val ? "#FAFAF8" : "#6B6B66", border: "none", cursor: "pointer" }}>{label}</button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#9A9992" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events or venues"
                style={{ background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "8px 12px 8px 32px", fontSize: 12.5, width: 210 }} />
              {search && <X size={13} onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9A9992", cursor: "pointer" }} />}
            </div>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 24px 100px" }}>
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: "80px 0", color: "#9A9992" }}>No events match those filters.</div>}

        {Object.entries(grouped).map(([month, evts]) => (
          <div key={month} style={{ marginBottom: 40 }}>
            <div className="disp" style={{ fontSize: 22, marginBottom: 6, letterSpacing: "-0.01em" }}>{month}</div>
            <div style={{ borderTop: "2px solid #111111" }}>
              {evts.map((e) => {
                const d = eventDisc(e.discipline);
                const f = fmtDay(e.date);
                return (
                  <div key={e.id} className="row-hover" style={{ display: "flex", alignItems: "center", gap: 20, padding: "16px 6px", borderBottom: "1px solid #E4E2DD", flexWrap: "wrap" }}>
                    <div className="mono" style={{ width: 88, flexShrink: 0, fontSize: 12.5, color: "#6B6B66" }}>{f.day}.{f.mon}</div>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{e.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#6B6B66", fontSize: 12.5, marginTop: 2, flexWrap: "wrap" }}>
                        <MapPin size={12} /> {e.venue}
                        <span className="mono" style={{ color: d.color, marginLeft: 6, fontSize: 10.5 }}>{d.label.toUpperCase()}</span>
                        <span className="mono" style={{ color: "#9A9992", fontSize: 10.5 }}>· {e.ages.map(ageLabel).join(", ")}</span>
                        {e.status === "provisional" && <span className="mono" style={{ color: "#C77F17", fontSize: 10.5 }}>· PROVISIONAL</span>}
                        {e.status === "cancelled" && <span className="mono" style={{ color: "#A13A2A", fontSize: 10.5 }}>· CANCELLED</span>}
                        <span className="mono" style={{ color: e.bookingStatus === "open" ? "#1F5D3A" : "#946A0E", fontSize: 10.5 }}>
                          · {e.bookingStatus === "open" ? "ENTRIES OPEN" : "ENTRIES TBC"}
                        </span>
                        <Link href={`/events/${e.id}/suggest-change`} className="mono" style={{ color: "#9A9992", fontSize: 10.5, textDecoration: "underline" }}>
                          · Suggest a change
                        </Link>
                      </div>
                    </div>
                    <span className="mono" style={{
                      fontSize: 10, fontWeight: 700, padding: "4px 9px", flexShrink: 0, letterSpacing: "0.03em",
                      background: e.kidsOnly ? "#EAF3EC" : "#FDF3E4", color: e.kidsOnly ? "#1F5D3A" : "#946A0E",
                    }}>
                      {e.kidsOnly ? "KIDS ONLY" : "KIDS + ADULTS"}
                    </span>
                    {e.bookingStatus === "open" ? (
                      <a href={e.booking ?? "#"} className="book-btn" style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#111111", border: "1px solid #111111", padding: "8px 18px" }}>
                        Book
                      </a>
                    ) : (
                      <a href={e.organiserUrl} style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#6B6B66", border: "1px solid #D8D6D0", padding: "8px 18px" }}>
                        Club website
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>
    </>
  );
}
