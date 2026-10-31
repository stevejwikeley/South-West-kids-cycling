import { describe, expect, it } from "vitest";
import { httpUrlOrNull } from "./safe-url";

describe("httpUrlOrNull", () => {
  it("keeps ordinary http(s) URLs", () => {
    expect(httpUrlOrNull("https://club.co.uk/events")).toBe("https://club.co.uk/events");
    expect(httpUrlOrNull("http://club.co.uk")).toBe("http://club.co.uk");
  });

  it("adds https:// to a bare domain", () => {
    expect(httpUrlOrNull("www.club.co.uk")).toBe("https://www.club.co.uk");
    expect(httpUrlOrNull("  club.co.uk/entries ")).toBe("https://club.co.uk/entries");
  });

  it("returns null for empty input", () => {
    expect(httpUrlOrNull("")).toBeNull();
    expect(httpUrlOrNull("   ")).toBeNull();
    expect(httpUrlOrNull(null)).toBeNull();
    expect(httpUrlOrNull(undefined)).toBeNull();
  });

  it("rejects non-web schemes", () => {
    expect(httpUrlOrNull("javascript:alert(1)")).toBeNull();
    expect(httpUrlOrNull("JaVaScRiPt:alert(1)")).toBeNull();
    expect(httpUrlOrNull("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(httpUrlOrNull("mailto:a@b.com")).toBeNull();
    expect(httpUrlOrNull("ftp://club.co.uk")).toBeNull();
  });

  it("rejects things that aren't public hostnames", () => {
    expect(httpUrlOrNull("not a url")).toBeNull();
    expect(httpUrlOrNull("localhost")).toBeNull();
    expect(httpUrlOrNull("https://intranet")).toBeNull();
  });

  it("rejects credentials embedded in the URL (https://real.site@evil.example)", () => {
    expect(httpUrlOrNull("https://britishcycling.org.uk@evil.example/")).toBeNull();
  });

  it("rejects line breaks and embedded whitespace", () => {
    expect(httpUrlOrNull("https://club.co.uk/\r\nATTACH:evil")).toBeNull();
    expect(httpUrlOrNull("https://club.co.uk/a b")).toBeNull();
  });
});
