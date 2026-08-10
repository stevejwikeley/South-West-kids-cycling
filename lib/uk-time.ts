// Converts a UK wall-clock date+time (as entered in a form) to a correct UTC
// ISO string, accounting for BST/GMT — needed because event times are always
// entered in UK local time regardless of the season.
function ukOffsetMinutes(instant: Date): number {
  const asUtc = new Date(instant.toLocaleString("en-US", { timeZone: "UTC" }));
  const asUk = new Date(instant.toLocaleString("en-US", { timeZone: "Europe/London" }));
  return (asUk.getTime() - asUtc.getTime()) / 60000;
}

export function ukLocalToUtcIso(dateStr: string, timeStr: string): string {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`);
  const offsetMin = ukOffsetMinutes(naive);
  return new Date(naive.getTime() - offsetMin * 60000).toISOString();
}

export function ukMidnightUtcIso(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

export function utcIsoToUkLocalParts(iso: string): { date: string; time: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(iso)).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
