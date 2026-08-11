import "server-only";
import { NextResponse } from "next/server";
import { verifyCode, verifyPkce } from "@/lib/mcp-oauth";

// The token_endpoint half of the OAuth shim (see lib/mcp-oauth.ts). Exchanges
// a passcode-gated authorization code + PKCE verifier for an access token —
// which is just MCP_SECRET, so app/api/mcp/route.ts's existing bearer check
// keeps working unchanged.
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

function errorResponse(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: CORS_HEADERS });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let params: URLSearchParams;
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    params = new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]));
  } else {
    params = new URLSearchParams(await request.text());
  }

  if (params.get("grant_type") !== "authorization_code") {
    return errorResponse("unsupported_grant_type");
  }

  const code = params.get("code");
  const codeVerifier = params.get("code_verifier");
  const redirectUri = params.get("redirect_uri");
  if (!code || !codeVerifier || !redirectUri) return errorResponse("invalid_request");

  const payload = verifyCode(code);
  if (!payload) return errorResponse("invalid_grant");
  if (payload.redirect_uri !== redirectUri) return errorResponse("invalid_grant");
  if (!verifyPkce(codeVerifier, payload.code_challenge)) return errorResponse("invalid_grant");

  return NextResponse.json(
    {
      access_token: process.env.MCP_SECRET,
      token_type: "Bearer",
      expires_in: 31536000,
    },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: { ...CORS_HEADERS, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "*" },
  });
}
