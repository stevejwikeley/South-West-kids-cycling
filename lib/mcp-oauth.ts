import "server-only";
import crypto from "crypto";

// Minimal OAuth 2.0 authorization-code + PKCE shim so claude.ai's "Add
// custom connector" flow (which only offers OAuth, not a raw bearer-token
// field) can drive a one-click "Connect" against /api/mcp. The real access
// control is the passcode entered at /oauth/authorize — it's the same
// MCP_SECRET the resource server (app/api/mcp/route.ts) already checks, so
// the token this hands back is just that secret. Vercel functions are
// stateless across requests, so the authorization code carries its own
// HMAC-signed claims instead of living in a database.

export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.southwestkidscycling.uk";

interface CodePayload {
  redirect_uri: string;
  code_challenge: string;
  exp: number;
}

function secret(): string {
  const s = process.env.MCP_SECRET;
  if (!s) throw new Error("MCP_SECRET is not configured.");
  return s;
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function issueCode(payload: Omit<CodePayload, "exp">): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyCode(code: string): CodePayload | null {
  const [body, sig] = code.split(".");
  if (!body || !sig || sig !== sign(body)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as CodePayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function checkPasscode(candidate: string): boolean {
  return timingSafeStringEqual(candidate, secret());
}

export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const computed = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return timingSafeStringEqual(computed, codeChallenge);
}
