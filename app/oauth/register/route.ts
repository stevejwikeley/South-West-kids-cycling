import "server-only";
import { NextResponse } from "next/server";

// RFC 7591 Dynamic Client Registration. There's nothing to persist — the
// real gate is the passcode entered at /oauth/authorize — so this just
// mints an unpersisted client_id and echoes back whatever the caller sent.
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  return NextResponse.json(
    {
      client_id: crypto.randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: body.client_name ?? "MCP client",
      redirect_uris: body.redirect_uris ?? [],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    { status: 201, headers: CORS_HEADERS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: { ...CORS_HEADERS, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "*" },
  });
}
