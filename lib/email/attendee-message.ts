import "server-only";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// Wraps an organiser-authored plain-text message in the branded shell — no
// further templating, matching the spec's "no rich templating" scope.
export function buildAttendeeMessageHtml(eventTitle: string, body: string): string {
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
            MESSAGE ABOUT ${escapeHtml(eventTitle.toUpperCase())}
          </td>
        </tr>
        <tr>
          <td style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#111111;white-space:pre-wrap;">
            ${escapeHtml(body)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`;
}
