import type { EventFormValues } from "@/lib/actions/parse-event-form";

// events_pending accepts inserts from anyone, unauthenticated, so a diff
// blob could in principle be crafted by hand (not just via submitChangeRequest)
// to name columns the public form never exposes — approved, created_by,
// source_type, etc. Applying only known EventFormValues keys on approval
// means such a row can't touch anything beyond what the legitimate form
// could have produced, regardless of what's actually stored in the diff.
//
// Two allowlists, not one: PUBLIC_DIFF_KEYS gates submitChangeRequest, the
// only unauthenticated path — SuggestChangeForm has no bookable/
// booking_capacity fields, so parseEventForm always returns false/null for
// them from that form, and including them here would diff every public
// suggest-change against a bookable event as a bogus "bookable: true→false"
// change nobody actually made. ADMIN_DIFF_KEYS is the isAdminRole()-gated
// superset (adds bookable/booking_capacity) used by the three paths that
// only ever run for a signed-in admin: updatePending's change_request
// branch, approveChange, and approveIngested.
export const PUBLIC_DIFF_KEYS = new Set<keyof EventFormValues>([
  "title",
  "discipline",
  "status",
  "all_day",
  "start_datetime",
  "end_datetime",
  "venue_name",
  "address",
  "postcode",
  "region",
  "age_categories",
  "kids_only",
  "booking_status",
  "booking_link",
  "organiser_url",
  "organiser_name",
  "organiser_contact",
  "description",
]);

export const ADMIN_DIFF_KEYS = new Set<keyof EventFormValues>([...PUBLIC_DIFF_KEYS, "bookable", "booking_capacity", "club_id", "kind"]);
