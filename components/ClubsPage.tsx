"use client";

import { useMemo, useState } from "react";
import { MapPin, Search, X, ExternalLink } from "lucide-react";
import { CLUB_DISCIPLINES, clubDisc } from "@/lib/mock-data";
import type { Club } from "@/lib/types";
import { trackEvent } from "@/lib/analytics";
import EmbedSnippet from "@/components/EmbedSnippet";

export default function ClubsPage({ clubs }: { clubs: Club[] }) {
  const [activeDisc, setActiveDisc] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const toggleDisc = (id: string) =>
    setActiveDisc((prev) => {
      const n = new Set(prev);
      const nowActive = !n.has(id);
      n.has(id) ? n.delete(id) : n.add(id);
      trackEvent("filter_discipline", { discipline: id, active: nowActive, page: "clubs" });
      return n;
    });

  const filtered = useMemo(
    () =>
      clubs.filter((c) => {
        if (activeDisc.size > 0 && !c.disciplines.some((d) => activeDisc.has(d))) return false;
        if (search && !`${c.name} ${c.location}`.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [clubs, activeDisc, search]
  );

  return (
    <>
      <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 0" }}>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>DEVON &amp; CORNWALL</div>
        <h1 className="disp" style={{ fontSize: "clamp(38px, 6.5vw, 76px)", lineHeight: 0.98, margin: 0, letterSpacing: "-0.01em" }}>
          Youth cycling clubs in Devon &amp; Cornwall.
        </h1>
        <p style={{ maxWidth: 480, fontSize: 16, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
          Youth sections, Go-Ride clubs and junior academies from Exeter and Plymouth to Truro and Falmouth — road, cross country mountain biking, cyclocross and triathlon.
        </p>
      </header>

      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "#FAFAF8", borderTop: "1px solid #E4E2DD", borderBottom: "1px solid #E4E2DD" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="mono" style={{ fontSize: 10.5, color: "#6B6B66", marginRight: 2 }}>DISCIPLINE</span>
            {CLUB_DISCIPLINES.map((d) => {
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
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#6B6B66" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => search && trackEvent("search", { query: search, page: "clubs" })} placeholder="Search clubs or towns"
                style={{ background: "#FFFFFF", border: "1px solid #D8D6D0", color: "#111111", padding: "8px 12px 8px 32px", fontSize: 12.5, width: 210 }} />
              {search && <X size={13} onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#6B6B66", cursor: "pointer" }} />}
            </div>
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 24px 100px" }}>
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: "80px 0", color: "#6B6B66" }}>No clubs match those filters.</div>}

        {filtered.length > 0 && (
          <div style={{ borderTop: "2px solid #111111" }}>
            {filtered.map((c) => (
              <div key={c.id} className="row-hover" style={{ display: "flex", alignItems: "flex-start", gap: 20, padding: "18px 6px", borderBottom: "1px solid #E4E2DD", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px", minWidth: 220 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5 }}>{c.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#6B6B66", fontSize: 12.5, marginTop: 3 }}>
                    <MapPin size={12} /> {c.location}
                    {c.founded && <span className="mono" style={{ color: "#6B6B66", fontSize: 10.5, marginLeft: 4 }}>· EST. {c.founded}</span>}
                  </div>
                  <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "#4A4A46", marginTop: 8, maxWidth: 480 }}>{c.summary}</p>
                </div>
                <div style={{ flex: "0 0 170px", minWidth: 150 }}>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                    {c.disciplines.map((did) => {
                      const d = clubDisc(did);
                      return <span key={did} className="mono" style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 8px", background: `${d.color}18`, color: d.color, letterSpacing: "0.02em" }}>{d.label.toUpperCase()}</span>;
                    })}
                  </div>
                  <div className="mono" style={{ fontSize: 10.5, color: "#6B6B66", lineHeight: 1.5 }}>{c.ageNote}</div>
                </div>
                <div style={{ flex: "0 0 100px" }}>
                  <span className="mono" style={{
                    fontSize: 10, fontWeight: 700, padding: "4px 9px", letterSpacing: "0.03em", display: "inline-block",
                    background: c.kidsOnly ? "#EAF3EC" : "#FDF3E4",
                    color: c.kidsOnly ? "#1F5D3A" : "#946A0E",
                  }}>
                    {c.kidsOnly ? "YOUTH ONLY" : "OPEN AGES"}
                  </span>
                </div>
                <a href={c.website ?? "#"} target="_blank" rel="noreferrer" onClick={() => trackEvent("club_visit_site_click", { club_id: c.id, club_name: c.name })} style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: "#111111", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid #111111", paddingBottom: 2, marginLeft: "auto" }}>
                  Visit site <ExternalLink size={12} />
                </a>
              </div>
            ))}
          </div>
        )}

        <EmbedSnippet />
      </main>
    </>
  );
}
