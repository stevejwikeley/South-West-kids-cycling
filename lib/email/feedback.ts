import "server-only";

import type { WillSubscribeType } from "@/lib/supabase/types";

export interface FeedbackEmailFields {
  racedBefore: boolean | null;
  usefulness: number | null;
  willSubscribe: WillSubscribeType | null;
  message: string | null;
  pageUrl: string | null;
  email: string | null;
}

const SUBSCRIBE_LABELS: Record<WillSubscribeType, string> = {
  yes: "Yes",
  no: "No",
  already: "Already subscribed",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Every question in the popup is optional, so only the ones actually
// answered are rendered — a ratings-only submission stays a two-line email
// rather than a wall of "not answered" rows.
function detailRow(label: string, value: string): string {
  return `        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#4A4A46;padding-bottom:8px;">
            <span style="color:#6B6B66;">${escapeHtml(label)}:</span> ${value}
          </td>
        </tr>`;
}

export function buildFeedbackSubject(fields: Pick<FeedbackEmailFields, "usefulness" | "message">): string {
  if (fields.usefulness !== null) return `Site feedback — rated ${fields.usefulness}/5`;
  return fields.message ? "Site feedback — comment" : "Site feedback";
}

// Matches the branded style of the other transactional emails (see
// contact.ts) — paper/ink/accent palette, table-based layout for
// email-client compatibility.
export function buildFeedbackEmailHtml(fields: FeedbackEmailFields): string {
  const headline = fields.usefulness !== null ? `Rated ${fields.usefulness}/5` : "New feedback";

  const rows: string[] = [];
  if (fields.racedBefore !== null) rows.push(detailRow("Raced before", fields.racedBefore ? "Yes" : "No"));
  if (fields.willSubscribe !== null) rows.push(detailRow("Will subscribe", SUBSCRIBE_LABELS[fields.willSubscribe]));
  if (fields.pageUrl) rows.push(detailRow("Page", escapeHtml(fields.pageUrl)));
  if (fields.email) {
    rows.push(
      detailRow("Email", `<a href="mailto:${escapeHtml(fields.email)}" style="color:#4A4A46;">${escapeHtml(fields.email)}</a>`)
    );
  }

  // The message renders under white-space:pre-wrap so the visitor's own line
  // breaks survive — which also means the template's indentation would show
  // up as leading whitespace. Hence the escaped text sits flush against its
  // tags rather than being laid out prettily.
  const messageBlock = fields.message
    ? `        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111111;white-space:pre-wrap;border-top:1px solid #E4E2DD;padding-top:20px;">${escapeHtml(fields.message)}</td>
        </tr>`
    : "";

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
            SITE FEEDBACK
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:26px;line-height:1.2;color:#111111;padding-bottom:20px;">
            ${escapeHtml(headline)}
          </td>
        </tr>
${rows.join("\n")}
${messageBlock}
      </table>
    </td>
  </tr>
</table>
`;
}
