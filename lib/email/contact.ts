import "server-only";

const REASON_LABELS: Record<string, string> = {
  general: "General enquiry",
  organiser: "Request organiser account",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Matches the branded style of the other transactional emails (see
// pending-digest.ts) — paper/ink/accent palette, table-based layout for
// email-client compatibility.
export function buildContactEmailHtml(fields: { name: string; email: string; reason: string; message: string }): string {
  const reasonLabel = REASON_LABELS[fields.reason] ?? fields.reason;

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
            CONTACT FORM — ${escapeHtml(reasonLabel.toUpperCase())}
          </td>
        </tr>
        <tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:26px;line-height:1.2;color:#111111;padding-bottom:20px;">
            ${escapeHtml(fields.name)}
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#4A4A46;padding-bottom:20px;">
            <a href="mailto:${escapeHtml(fields.email)}" style="color:#4A4A46;">${escapeHtml(fields.email)}</a>
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111111;white-space:pre-wrap;border-top:1px solid #E4E2DD;padding-top:20px;">
            ${escapeHtml(fields.message)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}
