import "server-only";
import { protectedResourceHandler, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { SITE_ORIGIN } from "@/lib/mcp-oauth";

// RFC 9728 metadata — points the /api/mcp resource at our own authorization
// server (see the sibling oauth-authorization-server route + /oauth/*).
export const GET = protectedResourceHandler({
  authServerUrls: [SITE_ORIGIN],
  resourceUrl: `${SITE_ORIGIN}/api/mcp`,
});

export const OPTIONS = metadataCorsOptionsRequestHandler();
