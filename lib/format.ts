export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const pad = (n: number) => String(n).padStart(2, "0");

export const fmtDay = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return { day: pad(d.getDate()), mon: MONTHS[d.getMonth()].slice(0, 3).toUpperCase() };
};
