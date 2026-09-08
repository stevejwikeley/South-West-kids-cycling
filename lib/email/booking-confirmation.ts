import "server-only";
import type { EventRow } from "@/lib/supabase/types";
import type { BookingPersonInput } from "@/lib/actions/parse-booking-form";
import { fmtDay } from "@/lib/format";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Matches the branded style of the other transactional emails (see
// contact.ts) — paper/ink/accent palette, table-based layout.
export function buildBookingConfirmationHtml(args: {
  event: EventRow;
  status: "confirmed" | "waitlisted";
  people: BookingPersonInput[];
  manageUrl: string;
}): string {
  const { event, status, people, manageUrl } = args;
  const f = fmtDay(event.start_datetime.slice(0, 10));
  const headline = status === "confirmed" ? "You're in." : "You're on the waitlist.";
  const body =
    status === "confirmed"
      ? "Your place is confirmed — see you there."
      : "This event is full right now. We'll email you the moment a space opens up.";
  const peopleList = people.map((p) => `${escapeHtml(p.name)} (${p.ageCategory.toUpperCase()})`).join(", ");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:15px;letter-spacing:0.02em;color:#111111;padding-bottom:32px;">
            SOUTH WEST KIDS CYCLING
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;letter-spacing:0.1em;color:#E0102A;padding-bottom:14px;">
            ${status === "confirmed" ? "BOOKING CONFIRMED" : "WAITLISTED"}
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:26px;line-height:1.2;color:#111111;padding-bottom:12px;">
            ${headline}
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#4A4A46;padding-bottom:20px;">
            ${body}
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.7;color:#111111;border-top:1px solid #E4E2DD;padding-top:16px;padding-bottom:16px;">
            <strong>${escapeHtml(event.title)}</strong><br/>
            ${f.day} ${f.mon} &middot; ${escapeHtml(event.venue_name)}<br/>
            ${peopleList}
          </td>
        </tr>
        <tr>
          <td style="padding-top:8px;">
            <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#111111;color:#FAFAF8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 26px;">
              View / manage this booking
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}
