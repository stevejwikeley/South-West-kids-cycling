export type DisciplineId = "cx" | "xc" | "road" | "tri" | "gravel" | "duathlon" | "clusters" | "other";
export type Region = "devon" | "cornwall" | "both";
export type AgeCategory = "u8" | "u10" | "u12" | "u14" | "u16";
export type BookingStatus = "open" | "planned";
export type EventStatus = "confirmed" | "provisional" | "cancelled";
export type ClubDisciplineId = "road" | "xc" | "cx";

export interface Discipline {
  id: DisciplineId;
  label: string;
  color: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  discipline: DisciplineId;
  date: string;
  venue: string;
  address: string | null;
  postcode: string | null;
  region: Region;
  status: EventStatus;
  kidsOnly: boolean;
  ages: AgeCategory[];
  bookingStatus: BookingStatus;
  booking: string | null;
  organiserUrl: string;
}

export interface Club {
  id: string;
  name: string;
  location: string;
  website: string | null;
  disciplines: ClubDisciplineId[];
  ageNote: string | null;
  kidsOnly: boolean;
  founded: string | null;
  summary: string | null;
}
