export function ukMidnightUtcIso(dateStr: string): string {
  return `${dateStr}T00:00:00.000Z`;
}

export function ukTomorrowDateIso(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.formatToParts(new Date()).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const today = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000Z`);
  today.setUTCDate(today.getUTCDate() + 1);
  return today.toISOString().slice(0, 10);
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
