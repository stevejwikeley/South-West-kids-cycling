"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, Search, X, Rss, ArrowUpRight, Filter, Download } from "lucide-react";
import { EVENT_DISCIPLINES, eventDisc, ageLabel } from "@/lib/mock-data";
import type { DisciplineId, CalendarEvent, Region } from "@/lib/types";
import { MONTHS, fmtDay } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";
import { eventsToCsv, downloadCsv } from "@/lib/csv";
import EditEventPanel from "@/components/admin/EditEventPanel";
import SuggestChangePanel from "@/components/events/SuggestChangePanel";

const REGION_HINT: Record<Region, string | undefined> = {
  devon: "Devon",
  cornwall: "Cornwall",
  both: undefined,
};

export default function CalendarPage({ events, isAdmin = false }: { events: CalendarEvent[]; isAdmin?: boolean }) {
  const [activeDisc, setActiveDisc] = useState<Set<DisciplineId>>(new Set());
  const [region, setRegion] = useState("all");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [suggestingId, setSuggestingId] = useState<string | null>(null);

  const visibleDisciplines = useMemo(() => {
    const present = new Set(events.map((e) => e.discipline));
    return EVENT_DISCIPLINES.filter((d) => present.has(d.id));
  }, [events]);

  const toggleDisc = (id: DisciplineId) =>
    setActiveDisc((prev) => {
      const n = new Set(prev);
      const nowActive = !n.has(id);
      n.has(id) ? n.delete(id) : n.add(id);
      trackEvent("filter_discipline", { discipline: id, active: nowActive });
      return n;
    });

  const activeFilterCount = (region !== "all" ? 1 : 0) + (search ? 1 : 0) + activeDisc.size;

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (activeDisc.size > 0 && !activeDisc.has(e.discipline)) return false;
        if (region !== "all" && e.region !== region && e.region !== "both") return false;
        if (search && !`${e.title} ${e.venue}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }).sort((a, b) => a.date.localeCompare(b.date)),
    [events, activeDisc, region, search]
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
      <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 40px" }}>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>DEVON &amp; CORNWALL — AGES 5 TO 16</div>
        <h1 className="disp" style={{ fontSize: "clamp(32px, 5.2vw, 60px)", lineHeight: 1.02, margin: 0, letterSpacing: "-0.01em" }}>
          One calendar for all cycling races and events across the Southwest
        </h1>
        <p style={{ maxWidth: 480, fontSize: 16, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
          Every Under 8s–16s race and club cluster session across Devon and Cornwall — Cross Country mountain biking, cyclocross, road, triathlon in one calendar.
        </p>
        <Link href="/getting-started" onClick={() => trackEvent("getting_started_click", { source: "calendar_hero" })} style={{ fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 5, borderBottom: "1px solid #111111", paddingBottom: 2, marginTop: 18, width: "fit-content" }}>
          New to racing? Start here <ArrowUpRight size={14} />
        </Link>
        <div style={{ marginTop: 26, maxWidth: 420 }}>
          <p style={{ fontSize: 13.5, color: "#4A4A46", marginBottom: 10, lineHeight: 1.5 }}>
            Get new events the moment they&apos;re added — subscribe once by email or calendar and never miss a race.
          </p>
          <Link href="/subscribe" onClick={() => trackEvent("subscribe_click", { source: "calendar_hero" })} style={{ background: "#111111", color: "#FAFAF8", border: "none", padding: "13px 24px", fontWeight: 700, fontSize: 13.5, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", width: "fit-content" }}>
            <Rss size={15} /> Subscribe
          </Link>
        </div>
      </header>

      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "#FAFAF8", borderTop: "1px solid #E4E2DD", borderBottom: "1px solid #E4E2DD" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              aria-label="Toggle filters"
              onClick={() => { setFiltersOpen((o) => !o); trackEvent("filters_toggle", { open: !filtersOpen }); }}
              className="mono"
              style={{ display: "flex", alignItems: "center", gap: 6, background: filtersOpen ? "#111111" : "none", color: filtersOpen ? "#FAFAF8" : "#111111", border: "1px solid #111111", padding: "8px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              <Filter size={13} />
              <span className="filter-toggle-label">Filters</span>
              {activeFilterCount > 0 && (
                <span className="mono" style={{ background: "#E0102A", color: "#FAFAF8", fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 999 }}>{activeFilterCount}</span>
              )}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => { downloadCsv("south-west-kids-cycling-events.csv", eventsToCsv(filtered)); trackEvent("download_csv", { count: filtered.length }); }}
                className="mono"
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #D8D6D0", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#111111", cursor: "pointer" }}
              >
                <Download size={13} /> Download CSV
              </button>
              <Link
                href="/subscribe"
                onClick={() => trackEvent("subscribe_click", { source: "filter_bar" })}
                className="mono"
                style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #D8D6D0", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#111111" }}
              >
                <Rss size={13} /> Subscribe
              </Link>
            </div>
          </div>

          {filtersOpen && (
            <>
              <div className="filter-controls-row">
                <div className="filter-region-toggle">
                  {[["all", "ALL"], ["devon", "DEVON"], ["cornwall", "CORNWALL"]].map(([val, label]) => (
                    <button key={val} onClick={() => { setRegion(val); trackEvent("filter_region", { region: val }); }} className="mono" style={{ padding: "8px 15px", fontSize: 11, fontWeight: 700, letterSpacing: "0.03em", background: region === val ? "#111111" : "transparent", color: region === val ? "#FAFAF8" : "#6B6B66", border: "none", cursor: "pointer" }}>{label}</button>
                  ))}
                </div>
                <div className="filter-search">
                  <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#6B6B66" }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => search && trackEvent("search", { query: search })} placeholder="Search events or venues"
                    style={{ background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "8px 12px 8px 32px", fontSize: 12.5, width: "100%" }} />
                  {search && <X size={13} onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#6B6B66", cursor: "pointer" }} />}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 10.5, color: "#6B6B66", marginRight: 2 }}>DISCIPLINE</span>
                {visibleDisciplines.map((d) => {
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
            </>
          )}
        </div>
      </div>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 24px 100px" }}>
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: "80px 0", color: "#6B6B66" }}>No events match those filters.</div>}

        {Object.entries(grouped).map(([month, evts]) => (
          <div key={month} style={{ marginBottom: 40 }}>
            <div className="disp" style={{ fontSize: 22, marginBottom: 6, letterSpacing: "-0.01em" }}>{month}</div>
            <div style={{ borderTop: "2px solid #111111" }}>
              {evts.map((e) => {
                const d = eventDisc(e.discipline);
                const f = fmtDay(e.date);
                return (
                  <div key={e.id} className="row-hover" style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 6px", borderBottom: "1px solid #E4E2DD", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{e.title}</span>
                        <span className="mono" style={{ fontSize: 12.5, color: "#6B6B66", flexShrink: 0 }}>{f.day}.{f.mon}</span>
                        <span className="mono" style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 8px", letterSpacing: "0.03em",
                          background: e.bookingStatus === "open" ? "#EAF3EC" : "#FDF3E4",
                          color: e.bookingStatus === "open" ? "#1F5D3A" : "#946A0E",
                        }}>
                          {e.bookingStatus === "open" ? "ENTRIES OPEN" : "ENTRIES TBC"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#6B6B66", fontSize: 12.5, marginTop: 4, flexWrap: "wrap" }}>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([e.venue, e.address, e.postcode, REGION_HINT[e.region], "UK"].filter(Boolean).join(", "))}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => trackEvent("venue_map_click", { event_id: e.id, event_title: e.title })}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#6B6B66", textDecoration: "underline", textUnderlineOffset: 2 }}
                        >
                          <MapPin size={12} /> {e.venue}
                        </a>
                        <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", background: `${d.color}18`, color: d.color, letterSpacing: "0.02em" }}>{d.label.toUpperCase()}</span>
                        <span className="mono" style={{ color: "#6B6B66", fontSize: 10.5 }}>· {e.ages.map(ageLabel).join(", ")}</span>
                        {e.status === "provisional" && <span className="mono" style={{ color: "#C77F17", fontSize: 10.5 }}>· PROVISIONAL</span>}
                        {e.status === "cancelled" && <span className="mono" style={{ color: "#A13A2A", fontSize: 10.5 }}>· CANCELLED</span>}
                        <span className="mono" style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 8px", letterSpacing: "0.03em",
                          background: e.kidsOnly ? "#EAF3EC" : "#FDF3E4", color: e.kidsOnly ? "#1F5D3A" : "#946A0E",
                        }}>
                          {e.kidsOnly ? "KIDS ONLY" : "KIDS + ADULTS"}
                        </span>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={() => { trackEvent("admin_edit_click", { event_id: e.id, event_title: e.title }); setEditingId(e.id); }}
                            className="mono"
                            style={{ color: "#6B6B66", fontSize: 10.5, textDecoration: "underline", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            Edit
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { trackEvent("suggest_change_click", { event_id: e.id, event_title: e.title }); setSuggestingId(e.id); }}
                            className="mono"
                            style={{ color: "#6B6B66", fontSize: 10.5, textDecoration: "underline", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}
                          >
                            Suggest a change
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      {e.bookingStatus === "open" && (
                        <a href={e.booking ?? "#"} target="_blank" rel="noreferrer" className="book-btn" onClick={() => trackEvent("book_click", { event_id: e.id, event_title: e.title, discipline: e.discipline })} style={{ fontSize: 12, fontWeight: 700, color: "#111111", border: "1px solid #111111", padding: "8px 18px" }}>
                          Book
                        </a>
                      )}
                      <a href={e.organiserUrl} target="_blank" rel="noreferrer" onClick={() => trackEvent("organiser_website_click", { event_id: e.id, event_title: e.title })} style={{ fontSize: 12, fontWeight: 700, color: "#6B6B66", border: "1px solid #D8D6D0", padding: "8px 18px" }}>
                        Organisers website
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>

      {isAdmin && <EditEventPanel eventId={editingId} onClose={() => setEditingId(null)} />}
      {!isAdmin && <SuggestChangePanel eventId={suggestingId} onClose={() => setSuggestingId(null)} />}
    </>
  );
}
