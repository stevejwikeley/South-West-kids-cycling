// lib/email/booking-reminder.ts
import "server-only";
import type { EventRow } from "@/lib/supabase/types";
import { fmtDay } from "@/lib/format";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildBookingReminderHtml(event: EventRow, manageUrl: string): string {
  const f = fmtDay(event.start_datetime.slice(0, 10));
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
            TOMORROW
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:26px;line-height:1.2;color:#111111;padding-bottom:12px;">
            ${escapeHtml(event.title)}
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#4A4A46;padding-bottom:20px;">
            ${f.day} ${f.mon} &middot; ${escapeHtml(event.venue_name)}
          </td>
        </tr>
        <tr>
          <td>
            <a href="${escapeHtml(manageUrl)}" style="display:inline-block;background:#111111;color:#FAFAF8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 26px;">
              View your booking
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}
