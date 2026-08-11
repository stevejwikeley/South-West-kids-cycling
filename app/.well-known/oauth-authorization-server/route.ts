import "server-only";
import { NextResponse } from "next/server";
import { SITE_ORIGIN } from "@/lib/mcp-oauth";

// RFC 8414 metadata for the minimal OAuth shim in lib/mcp-oauth.ts + the
// /oauth/* routes — lets claude.ai's connector UI discover how to obtain a
// token for /api/mcp without needing a raw bearer-token field.
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

export async function GET() {
  return NextResponse.json(
    {
      issuer: SITE_ORIGIN,
      authorization_endpoint: `${SITE_ORIGIN}/oauth/authorize`,
      token_endpoint: `${SITE_ORIGIN}/oauth/token`,
      registration_endpoint: `${SITE_ORIGIN}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    },
    { headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: { ...CORS_HEADERS, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*" },
  });
}
