export type DisciplineId = "cx" | "xc" | "road" | "tri" | "clusters" | "other";
export type Region = "devon" | "cornwall";
export type AgeCategory = "u8" | "u10" | "u12" | "u14" | "u16";
export type BookingStatus = "open" | "planned";
export type EventStatus = "confirmed" | "provisional" | "cancelled";

export interface Discipline {
  id: DisciplineId;
  label: string;
  color: string;
}

export interface CalendarEvent {
  id: number;
  title: string;
  discipline: DisciplineId;
  date: string;
  venue: string;
  region: Region;
  status: EventStatus;
  kidsOnly: boolean;
  ages: AgeCategory[];
  bookingStatus: BookingStatus;
  booking: string | null;
  organiserUrl: string;
}

export const EVENT_DISCIPLINES: Discipline[] = [
  { id: "cx", label: "Cyclocross", color: "#E0102A" },
  { id: "xc", label: "XC", color: "#1F5D3A" },
  { id: "road", label: "Road", color: "#1D3A6B" },
  { id: "tri", label: "Triathlon", color: "#0E7C86" },
  { id: "clusters", label: "Club Clusters", color: "#6B6B66" },
  { id: "other", label: "Other", color: "#6A3F86" },
];

export const eventDisc = (id: DisciplineId) => EVENT_DISCIPLINES.find((d) => d.id === id)!;
export const ageLabel = (id: AgeCategory) => id.toUpperCase();

export const EVENTS: CalendarEvent[] = [
  { id: 1, title: "SWCX Round 1 — Torbay", discipline: "cx", date: "2026-09-13", venue: "Torbay", region: "devon", status: "confirmed", kidsOnly: false, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "open", booking: "#", organiserUrl: "#" },
  { id: 2, title: "SWCX Round 2 — Scorrier Estate", discipline: "cx", date: "2026-09-27", venue: "Scorrier Estate", region: "cornwall", status: "confirmed", kidsOnly: false, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "open", booking: "#", organiserUrl: "#" },
  { id: 3, title: "SWCX Round 3 — Saltash School", discipline: "cx", date: "2026-10-04", venue: "Saltash School", region: "cornwall", status: "confirmed", kidsOnly: false, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 4, title: "SWCX Round 4 — Wadebridge", discipline: "cx", date: "2026-10-11", venue: "Wadebridge", region: "cornwall", status: "confirmed", kidsOnly: false, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 5, title: "SWCX Round 5 — Newham Top", discipline: "cx", date: "2026-11-01", venue: "Newham Estate", region: "devon", status: "confirmed", kidsOnly: false, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 6, title: "SWCX Round 6 — Escot", discipline: "cx", date: "2026-11-15", venue: "Escot", region: "devon", status: "confirmed", kidsOnly: false, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 7, title: "SWCX Round 7 — Arlington", discipline: "cx", date: "2026-11-22", venue: "Arlington Court", region: "devon", status: "confirmed", kidsOnly: false, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 8, title: "SWCX Round 8 — Exeter Bike Park", discipline: "cx", date: "2026-11-29", venue: "Exeter Bike Park", region: "devon", status: "confirmed", kidsOnly: false, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 9, title: "SWCX Round 9 — Newham Bottom", discipline: "cx", date: "2026-12-06", venue: "Newham Estate", region: "devon", status: "confirmed", kidsOnly: false, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 10, title: "SWCX Round 10 — Perranporth", discipline: "cx", date: "2026-12-13", venue: "Perranporth", region: "cornwall", status: "confirmed", kidsOnly: false, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 11, title: "Haldon Forest Youth XC — Rd 1", discipline: "xc", date: "2026-08-16", venue: "Haldon Forest", region: "devon", status: "confirmed", kidsOnly: true, ages: ["u10", "u12", "u14", "u16"], bookingStatus: "open", booking: "#", organiserUrl: "#" },
  { id: 12, title: "Haldon Forest Youth XC — Rd 2", discipline: "xc", date: "2026-09-20", venue: "Haldon Forest", region: "devon", status: "provisional", kidsOnly: true, ages: ["u10", "u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 13, title: "Haldon Forest Youth XC — Rd 3", discipline: "xc", date: "2026-10-18", venue: "Haldon Forest", region: "devon", status: "confirmed", kidsOnly: true, ages: ["u10", "u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 14, title: "Devon Youth Road Race Series — Rd 1", discipline: "road", date: "2026-08-23", venue: "Simpson Cross, Crediton", region: "devon", status: "confirmed", kidsOnly: true, ages: ["u12", "u14", "u16"], bookingStatus: "open", booking: "#", organiserUrl: "#" },
  { id: 15, title: "Cornwall CC Junior Road Race", discipline: "road", date: "2026-09-06", venue: "Wadebridge", region: "cornwall", status: "confirmed", kidsOnly: false, ages: ["u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 16, title: "MDCC Youth Time Trial Taster", discipline: "road", date: "2026-10-25", venue: "A38 Course, Plymouth", region: "devon", status: "confirmed", kidsOnly: true, ages: ["u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 17, title: "Exmouth Sprint Triathlon — Junior Wave", discipline: "tri", date: "2026-08-30", venue: "Exmouth Seafront", region: "devon", status: "confirmed", kidsOnly: false, ages: ["u12", "u14", "u16"], bookingStatus: "open", booking: "#", organiserUrl: "#" },
  { id: 18, title: "Truro Junior Aquathlon", discipline: "tri", date: "2026-09-14", venue: "Boconnoc Estate", region: "cornwall", status: "confirmed", kidsOnly: true, ages: ["u10", "u12", "u14"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 19, title: "MDCC Youth Academy — Tuesday Track", discipline: "clusters", date: "2026-08-18", venue: "Tiverton Track", region: "devon", status: "confirmed", kidsOnly: true, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "open", booking: "#", organiserUrl: "#" },
  { id: 20, title: "Exeter Wheelers Youth — Thursday Skills", discipline: "clusters", date: "2026-08-20", venue: "Haldon Forest", region: "devon", status: "confirmed", kidsOnly: true, ages: ["u8", "u10", "u12"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 21, title: "Bowman Go-Ride Skills Day", discipline: "clusters", date: "2026-08-29", venue: "Newton Abbot Leisure Centre", region: "devon", status: "confirmed", kidsOnly: true, ages: ["u8", "u10"], bookingStatus: "open", booking: "#", organiserUrl: "#" },
  { id: 22, title: "Cornwall Go-Ride Taster Session", discipline: "clusters", date: "2026-09-12", venue: "Par Track", region: "cornwall", status: "provisional", kidsOnly: true, ages: ["u8"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 23, title: "MDCC Youth Academy — Tuesday Track", discipline: "clusters", date: "2026-08-25", venue: "Tiverton Track", region: "devon", status: "confirmed", kidsOnly: true, ages: ["u8", "u10", "u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
  { id: 26, title: "SW Youth Duathlon", discipline: "tri", date: "2026-10-11", venue: "Bude", region: "cornwall", status: "confirmed", kidsOnly: false, ages: ["u12", "u14", "u16"], bookingStatus: "planned", booking: null, organiserUrl: "#" },
];

export interface Club {
  id: number;
  name: string;
  location: string;
  website: string;
  disciplines: ("road" | "xc" | "cx")[];
  ageNote: string;
  kidsOnly: boolean;
  founded: string | null;
  summary: string;
}

export const CLUB_DISCIPLINES: Discipline[] = [
  { id: "road", label: "Road", color: "#1D3A6B" },
  { id: "xc", label: "XC / MTB", color: "#1F5D3A" },
  { id: "cx", label: "Cyclocross", color: "#E0102A" },
];

export const clubDisc = (id: string) => CLUB_DISCIPLINES.find((d) => d.id === id)!;

export const CLUBS: Club[] = [
  {
    id: 1, name: "Mid Devon CC", location: "Newton Abbot, Devon",
    website: "https://www.middevon.cc", disciplines: ["road", "xc", "cx"],
    ageNote: "Go-Ride youth section, ages 8–16", kidsOnly: false, founded: "1930",
    summary: "One of the South West's largest and longest-established clubs. British Cycling Go-Ride registered, with junior coaching across road, mountain bike and cyclocross sitting alongside a full adult racing programme — including hosting the Dartmoor Classic sportive.",
  },
  {
    id: 2, name: "Wheal Velocity", location: "Truro, Cornwall",
    website: "https://www.whealvelocity.com", disciplines: ["road", "xc", "cx"],
    ageNote: "Junior Academy, Saturdays 1.30–4pm", kidsOnly: false, founded: null,
    summary: "Based at Wheal Jane's traffic-free circuits near Truro, and widely regarded as the largest youth cycling club in the South West. Runs a Junior Academy, Development Squad and Race Team alongside road and off-road sessions for all ages.",
  },
  {
    id: 3, name: "Exeter Wheelers", location: "Exeter, Devon",
    website: "https://www.exeterwheelers.co.uk", disciplines: ["road"],
    ageNote: "Exeter Wheelers Academy, ages 8+", kidsOnly: false, founded: "1924",
    summary: "A road-focused club founded in 1924, with a relaunched Youth Academy and British Cycling Go-Ride Focus Club status. Runs time trials, criteriums and a full programme of social and training rides year-round.",
  },
  {
    id: 4, name: "North Devon Velo", location: "Barnstaple, Devon",
    website: "https://www.northdevonvelo.com", disciplines: ["road", "xc", "cx"],
    ageNote: "Youth section Saturdays at Petroc, under 16s", kidsOnly: false, founded: null,
    summary: "The only British Cycling Go-Ride accredited club in North Devon, formed from a merger of North Devon Wheelers and Taw Velo. Covers road, time trial, track, cyclocross and mountain biking, and hosts an SWCX round at Coxleigh Barton.",
  },
  {
    id: 5, name: "Dartmoor Velo", location: "Tavistock, Devon",
    website: "https://www.dartmoorvelo.co.uk", disciplines: ["road", "xc", "cx"],
    ageNote: "Ages 8–16 — youth only, no adult section", kidsOnly: true, founded: null,
    summary: "A dedicated youth club covering West Devon and North Cornwall, with Saturday morning coaching in road, mountain bike and cyclocross for young riders. There's no separate adult racing programme — it's built around junior riders.",
  },
];
