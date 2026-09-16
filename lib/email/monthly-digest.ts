import "server-only";
import type { CalendarEvent } from "@/lib/types";
import { eventDisc } from "@/lib/mock-data";
import { fmtDay } from "@/lib/format";

// Matches the branded style of the other transactional emails (see
// pending-digest.ts) — paper/ink/accent palette, table-based layout for
// email-client compatibility.

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function eventRow(e: CalendarEvent): string {
  const d = eventDisc(e.discipline);
  const f = fmtDay(e.date);
  const bookingLabel = e.bookingStatus === "open" ? "Entries open" : "Entries TBC";
  // Same fallback logic as the calendar row itself (CalendarPage.tsx):
  // link to the booking page once entries are open, otherwise the
  // organiser's own site as a placeholder while booking isn't live yet.
  const actionUrl = e.bookingStatus === "open" ? e.booking ?? e.organiserUrl : e.organiserUrl;
  const actionLabel = e.bookingStatus === "open" ? "Book" : "Organisers website";

  return `<tr>
    <td style="padding:16px 0;border-top:1px solid #E4E2DD;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:11px;font-weight:bold;color:#6B6B66;padding-bottom:6px;">
            ${f.day} ${f.mon} &middot; <span style="color:${d.color};">${escapeHtml(d.label.toUpperCase())}</span> &middot; ${bookingLabel}
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:17px;line-height:1.3;color:#111111;padding-bottom:4px;">
            ${escapeHtml(e.title)}
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:13px;color:#6B6B66;padding-bottom:8px;">
            ${escapeHtml(e.venue)}
          </td>
        </tr>
        <tr>
          <td>
            <a href="${escapeHtml(actionUrl)}" style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:12px;font-weight:bold;color:#111111;text-decoration:underline;">
              ${actionLabel} &rarr;
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function buildMonthlyDigestHtml(events: CalendarEvent[], siteUrl: string, unsubscribeUrl: string): string {
  const rows = events.map(eventRow).join("\n");

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
            MONTHLY DIGEST
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:28px;line-height:1.2;color:#111111;padding-bottom:20px;">
            ${events.length} upcoming ${events.length === 1 ? "event" : "events"} in Devon, Cornwall &amp; Somerset.
          </td>
        </tr>
        <tr>
          <td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${rows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding-top:28px;">
            <a href="${siteUrl}" style="display:inline-block;background:#111111;color:#FAFAF8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 26px;">
              See the full calendar
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding-top:28px;border-top:1px solid #E4E2DD;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F2EE;">
              <tr>
                <td style="padding:18px 20px;">
                  <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:#111111;padding-bottom:6px;">
                    It's better to be in your calendar than in your inbox.
                  </div>
                  <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#6B6B66;padding-bottom:12px;">
                    Subscribe once and every new event appears automatically — no more waiting for this email.
                  </div>
                  <a href="${siteUrl}/subscribe" style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:12.5px;font-weight:bold;color:#111111;text-decoration:underline;">
                    Add to your calendar &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6B6B66;padding-top:20px;">
            Sent once a month. <a href="${unsubscribeUrl}" style="color:#6B6B66;">Unsubscribe</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}
