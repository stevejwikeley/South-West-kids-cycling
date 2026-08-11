import "server-only";

// Matches the branded style of the Supabase auth email templates
// (supabase/email-templates/*.html) — paper/ink/accent palette, table-based
// layout for email-client compatibility.
export function buildPendingDigestHtml(count: number, pendingUrl: string): string {
  const noun = count === 1 ? "event" : "events";

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
            PENDING QUEUE
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:32px;line-height:1.15;color:#111111;padding-bottom:20px;">
            ${count} ${noun} waiting.
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#4A4A46;padding-bottom:28px;">
            ${count === 1 ? "There's 1 item" : `There are ${count} items`} in the pending queue waiting for review — new events, change requests, or smart-ingest candidates.
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:28px;">
            <a href="${pendingUrl}" style="display:inline-block;background:#111111;color:#FAFAF8;font-family:-apple-system,Helvetica,Arial,sans-serif;font-weight:bold;font-size:14px;text-decoration:none;padding:13px 26px;">
              Review the pending queue
            </a>
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#9A9992;border-top:1px solid #E4E2DD;padding-top:20px;">
            Sent once daily only when something's waiting — an empty queue means no email.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}
