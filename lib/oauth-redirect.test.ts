import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedRedirectUri } from "./oauth-redirect.ts";

test("allows claude.ai's connector callback and local clients", () => {
  assert.equal(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(isAllowedRedirectUri("https://claude.com/api/mcp/auth_callback"), true);
  assert.equal(isAllowedRedirectUri("http://localhost:6274/oauth/callback"), true);
  assert.equal(isAllowedRedirectUri("http://127.0.0.1:33418/callback"), true);
});

test("rejects other hosts and lookalikes", () => {
  assert.equal(isAllowedRedirectUri("https://evil.example/cb"), false);
  assert.equal(isAllowedRedirectUri("https://claude.ai.evil.example/cb"), false);
  assert.equal(isAllowedRedirectUri("https://evilclaude.ai/cb"), false);
  assert.equal(isAllowedRedirectUri("https://claude.ai@evil.example/cb"), false);
  assert.equal(isAllowedRedirectUri("http://claude.ai/api/mcp/auth_callback"), false);
  assert.equal(isAllowedRedirectUri("http://localhost.evil.example/cb"), false);
  assert.equal(isAllowedRedirectUri("javascript:alert(1)"), false);
  assert.equal(isAllowedRedirectUri("not a url"), false);
  assert.equal(isAllowedRedirectUri(""), false);
  assert.equal(isAllowedRedirectUri(null), false);
});

test("extra hosts come from MCP_OAUTH_REDIRECT_HOSTS, https only", () => {
  process.env.MCP_OAUTH_REDIRECT_HOSTS = "inspector.example.com, other.example";
  try {
    assert.equal(isAllowedRedirectUri("https://inspector.example.com/cb"), true);
    assert.equal(isAllowedRedirectUri("http://inspector.example.com/cb"), false);
  } finally {
    delete process.env.MCP_OAUTH_REDIRECT_HOSTS;
  }
});
