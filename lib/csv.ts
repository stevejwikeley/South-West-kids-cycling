import type { CalendarEvent } from "@/lib/types";
import { eventDisc } from "@/lib/mock-data";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function eventsToCsv(events: CalendarEvent[]): string {
  const headers = ["Date", "Title", "Discipline", "Venue", "Address", "Postcode", "Region", "Ages", "Kids only", "Booking status", "Booking link", "Organiser URL"];
  const rows = events.map((e) => [
    e.date,
    e.title,
    eventDisc(e.discipline).label,
    e.venue,
    e.address ?? "",
    e.postcode ?? "",
    e.region,
    e.ages.join("; "),
    e.kidsOnly ? "Yes" : "No",
    e.bookingStatus,
    e.booking ?? "",
    e.organiserUrl,
  ]);
  return [headers, ...rows].map((row) => row.map(String).map(csvEscape).join(",")).join("\n");
}

// Client-only (Blob/URL/DOM) — only ever called from a "use client" component's event handler.
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
