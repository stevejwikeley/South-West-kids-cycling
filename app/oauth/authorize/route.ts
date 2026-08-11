import "server-only";
import { NextResponse } from "next/server";
import { issueCode, checkPasscode } from "@/lib/mcp-oauth";

// The authorization_endpoint half of the OAuth shim described in
// lib/mcp-oauth.ts. GET renders a passcode gate; POST checks it and, on
// success, redirects back to the client with a signed authorization code.

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderForm(fields: { redirect_uri: string; code_challenge: string; state: string }, error?: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorize — South West Kids Cycling</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #FAFAF8; color: #111111; display: flex; min-height: 100vh; align-items: center; justify-content: center; margin: 0; }
  main { max-width: 380px; padding: 32px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { font-size: 14px; line-height: 1.5; color: #4A4A46; margin: 0 0 20px; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 14px; border: 1px solid #D8D6D0; margin-bottom: 12px; }
  button { width: 100%; padding: 12px; font-weight: 700; font-size: 13px; background: #111111; color: #FAFAF8; border: none; cursor: pointer; }
  .error { color: #A13A2A; font-size: 13px; margin-bottom: 12px; }
</style>
</head><body>
<main>
  <h1>Authorize connection</h1>
  <p>A client is asking to connect to the South West Kids Cycling event-ingestion tools. Enter the site's MCP passcode to approve it.</p>
  ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
  <form method="post">
    <input type="password" name="passcode" placeholder="Passcode" autofocus required />
    <input type="hidden" name="redirect_uri" value="${escapeHtml(fields.redirect_uri)}" />
    <input type="hidden" name="code_challenge" value="${escapeHtml(fields.code_challenge)}" />
    <input type="hidden" name="state" value="${escapeHtml(fields.state)}" />
    <button type="submit">Authorize</button>
  </form>
</main>
</body></html>`;
}

function html(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state") ?? "";
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  const responseType = params.get("response_type");

  if (!redirectUri) return html("Missing redirect_uri.", 400);

  if (responseType !== "code" || !codeChallenge || codeChallengeMethod !== "S256") {
    const errUrl = new URL(redirectUri);
    errUrl.searchParams.set("error", "invalid_request");
    if (state) errUrl.searchParams.set("state", state);
    return NextResponse.redirect(errUrl, 302);
  }

  return html(renderForm({ redirect_uri: redirectUri, code_challenge: codeChallenge, state }));
}

export async function POST(request: Request) {
  const form = await request.formData();
  const passcode = String(form.get("passcode") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const state = String(form.get("state") ?? "");

  if (!redirectUri || !codeChallenge) return html("Missing form fields.", 400);

  if (!checkPasscode(passcode)) {
    return html(renderForm({ redirect_uri: redirectUri, code_challenge: codeChallenge, state }, "Incorrect passcode — try again."));
  }

  const code = issueCode({ redirect_uri: redirectUri, code_challenge: codeChallenge });
  const dest = new URL(redirectUri);
  dest.searchParams.set("code", code);
  if (state) dest.searchParams.set("state", state);
  return NextResponse.redirect(dest, 303);
}
