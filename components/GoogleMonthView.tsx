// The month view on the calendar page: Google Calendar's own embed of a
// Google calendar that subscribes to our /calendar.ics feed. Google refreshes
// that subscription on its own schedule (typically every few hours, up to a
// day), so a just-approved event can show in the list before it shows here.
// It's also always the full feed — the page's filters don't reach into it.
const CALENDAR_ID = "rrnkf5co0b4etkckm054ntr4ar1pec46@import.calendar.google.com";

const EMBED_URL =
  "https://calendar.google.com/calendar/embed?" +
  new URLSearchParams({
    src: CALENDAR_ID,
    ctz: "Europe/London",
    mode: "MONTH",
    wkst: "2", // weeks start on Monday
    showTitle: "0",
    showPrint: "0",
    showCalendars: "0",
    showTz: "0",
  }).toString();

export default function GoogleMonthView() {
  return (
    <div>
      <iframe
        src={EMBED_URL}
        title="South West Kids Cycling — month view"
        loading="lazy"
        style={{ border: "1px solid #E4E2DD", width: "100%", height: 640, background: "#FFFFFF", display: "block" }}
      />
      <p style={{ fontSize: 12.5, color: "#6B6B66", marginTop: 10, lineHeight: 1.5 }}>
        Shows every event — filters only apply to the list. New events can take a few hours to appear here.
      </p>
    </div>
  );
}
