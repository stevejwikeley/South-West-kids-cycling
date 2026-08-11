import Link from "next/link";
import { EVENT_DISCIPLINES } from "@/lib/mock-data";

const DISCIPLINE_GUIDE: Record<string, { blurb: string; format: string; goodFirstRace: boolean }> = {
  clusters: {
    blurb: "Coached sessions at a club, not a race in the traditional sense — skills, drills and short sprints in a closed, traffic-free space. Turn up, borrow a bit of kit if you don't have it, and see if your child enjoys being on two wheels with other kids.",
    format: "An hour or so of coached activity, usually weekly during term time. No entry fee beyond a small session cost, no results, no pressure.",
    goodFirstRace: true,
  },
  cx: {
    blurb: "Cyclocross: short, muddy off-road laps with obstacles to hop over and the odd steep bank to run up. Races are age-graded and short — often 10–20 minutes — so nobody's out there for hours.",
    format: "Timed laps of a closed circuit, usually a field or park. Categories are split tightly by age, so your child races only other kids their age.",
    goodFirstRace: true,
  },
  xc: {
    blurb: "Cross country mountain biking on natural or purpose-built trails — more technical than cyclocross, with singletrack, roots and the occasional drop, but youth courses are scaled right down for age and ability.",
    format: "Laps of a marked trail loop, distance scaled to age category. Bring a mountain bike (or hybrid) rather than a road bike.",
    goodFirstRace: false,
  },
  road: {
    blurb: "Racing on tarmac — closed circuits or traffic-managed courses, not open roads. Youth road racing focuses on bike handling in a group as much as raw speed.",
    format: "Circuit races or time trials on closed or traffic-managed roads. A road or hybrid bike and a genuine helmet are the minimum kit.",
    goodFirstRace: false,
  },
  tri: {
    blurb: "Swim, bike, run, in that order, over junior-scaled distances — often a 50–100m pool swim, a short closed-road or off-road bike leg, and a short run.",
    format: "Timed multi-discipline event, usually at a leisure centre or sports ground with all three legs close together. Needs a bit more kit (goggles, trainers) than a bike-only event.",
    goodFirstRace: false,
  },
  gravel: {
    blurb: "Longer off-road rides on unsurfaced tracks and lanes, on a gravel or cyclocross-style bike — more endurance-focused than technical, with distances scaled down for junior categories.",
    format: "A marked route rather than closed laps, usually with multiple distance options. Needs a bike suited to loose surfaces — a mountain bike works fine even without a dedicated gravel bike.",
    goodFirstRace: false,
  },
  duathlon: {
    blurb: "Run, bike, run — no swim leg, so less kit than a triathlon. A good option if your child is a confident runner and cyclist but swimming isn't their thing.",
    format: "Timed multi-discipline event, typically at a sports ground or closed circuit. Trainers and a bike (with helmet) are the only real kit needed.",
    goodFirstRace: false,
  },
  other: {
    blurb: "Anything that doesn't fit neatly elsewhere — track sessions, one-off taster days. Check the individual event listing for what to expect.",
    format: "Varies by event — see the listing for details.",
    goodFirstRace: false,
  },
};

export default function Page() {
  return (
    <>
      <header style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 0" }}>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: "0.12em", color: "#E0102A", marginBottom: 16, fontWeight: 700 }}>NEW TO RACING</div>
        <h1 className="disp" style={{ fontSize: "clamp(38px, 6.5vw, 76px)", lineHeight: 0.98, margin: 0, letterSpacing: "-0.01em" }}>
          Getting started.
        </h1>
        <p style={{ maxWidth: 560, fontSize: 16, lineHeight: 1.6, color: "#4A4A46", marginTop: 22 }}>
          Everything here is genuinely aimed at first-timers — you don&apos;t need racing experience, expensive kit, or a club membership to bring your child along to their first event.
        </p>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "56px 24px 100px" }}>
        <section style={{ marginBottom: 56 }}>
          <div className="disp" style={{ fontSize: 24, marginBottom: 18, letterSpacing: "-0.01em" }}>Where to start</div>
          <div style={{ borderTop: "2px solid #111111", paddingTop: 20, maxWidth: 720 }}>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "#4A4A46" }}>
              If you&apos;re not sure where to begin, start with a <strong>Club Clusters</strong> session rather than a race. It&apos;s coached, low-pressure, and lets you and your child work out whether they enjoy a particular discipline before you commit to an actual event. Most clubs let you turn up to a session or two before joining — see the <Link href="/clubs" style={{ borderBottom: "1px solid #111111" }}>clubs directory</Link> for one near you.
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "#4A4A46", marginTop: 16 }}>
              Once you&apos;re ready for an actual event, <strong>cyclocross</strong> is usually the friendliest first race — short, age-graded, low-speed, and forgiving if your child comes off (it happens to everyone, on grass or mud, not tarmac).
            </p>
          </div>
        </section>

        <section style={{ marginBottom: 56 }}>
          <div className="disp" style={{ fontSize: 24, marginBottom: 18, letterSpacing: "-0.01em" }}>What each discipline involves</div>
          <div style={{ borderTop: "2px solid #111111" }}>
            {EVENT_DISCIPLINES.map((d) => {
              const guide = DISCIPLINE_GUIDE[d.id];
              return (
                <div key={d.id} style={{ padding: "22px 6px", borderBottom: "1px solid #E4E2DD", display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <div style={{ flex: "0 0 180px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: 15.5 }}>{d.label}</span>
                    </div>
                    {guide.goodFirstRace && (
                      <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, color: "#1F5D3A", background: "#EAF3EC", padding: "3px 8px", display: "inline-block", marginTop: 6 }}>
                        GOOD FIRST STEP
                      </span>
                    )}
                  </div>
                  <div style={{ flex: "1 1 420px", minWidth: 260 }}>
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: "#4A4A46" }}>{guide.blurb}</p>
                    <p className="mono" style={{ fontSize: 11, color: "#9A9992", marginTop: 8, lineHeight: 1.6 }}>{guide.format}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ marginBottom: 56 }}>
          <div className="disp" style={{ fontSize: 24, marginBottom: 18, letterSpacing: "-0.01em" }}>What to bring</div>
          <div style={{ borderTop: "2px solid #111111", paddingTop: 20, maxWidth: 720 }}>
            <ul style={{ fontSize: 15, lineHeight: 1.9, color: "#4A4A46", paddingLeft: 20 }}>
              <li>A bike suited to the discipline (see above) — it doesn&apos;t need to be expensive or new, just roadworthy and the right size.</li>
              <li>A properly fitted cycling helmet — non-negotiable at every event on this calendar.</li>
              <li>Weather-appropriate layers. Cyclocross and XC especially mean standing around outdoors, often in mud — spare socks and a warm layer for afterwards are always worth it.</li>
              <li>Water and a snack — entry fees rarely include catering, and younger riders burn through energy fast.</li>
              <li>British Cycling membership is sometimes required for entry (check the individual listing) — day licences are usually available on the gate if you&apos;re not a member.</li>
            </ul>
          </div>
        </section>

        <section>
          <div className="disp" style={{ fontSize: 24, marginBottom: 18, letterSpacing: "-0.01em" }}>Finding a first race</div>
          <div style={{ borderTop: "2px solid #111111", paddingTop: 20, maxWidth: 720 }}>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "#4A4A46" }}>
              The <Link href="/" style={{ borderBottom: "1px solid #111111" }}>calendar</Link> lists every event with a few things worth knowing how to read:
            </p>
            <ul style={{ fontSize: 15, lineHeight: 1.9, color: "#4A4A46", paddingLeft: 20, marginTop: 12 }}>
              <li><strong>Kids only</strong> vs <strong>Kids + Adults</strong> — whether your child races alongside adults or in a fully separate youth event.</li>
              <li><strong>Entries open</strong> vs <strong>Entries TBC</strong> — whether you can book now, or the date&apos;s confirmed but booking isn&apos;t live yet (use the &quot;Club website&quot; link to keep an eye on it).</li>
              <li>Age categories (U8 / U10 / U12 / U14 / U16) — most events split fields tightly by age, so your child only ever rides against similar-aged riders.</li>
            </ul>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "#4A4A46", marginTop: 16 }}>
              Every event also has a &quot;Suggest a change&quot; link — use it if anything on the calendar looks wrong or out of date.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
