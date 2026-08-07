import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "../../src/server/security/origin.js";

describe("isAllowedOrigin", () => {
  const configuredOrigin = "https://slideshow.example.com";

  it("accepts only the exact normalized configured origin", () => {
    expect(isAllowedOrigin(configuredOrigin, configuredOrigin)).toBe(true);
  });

  it("rejects absent, opaque, malformed, and multiple origins", () => {
    for (const origin of [
      undefined,
      "null",
      "not a url",
      " https://slideshow.example.com",
      "https://slideshow.example.com ",
      "https:\\\\slideshow.example.com",
      "https://slideshow.example.com\\",
      "https://slideshow.example.com/",
      "https://slideshow.example.com:443",
      "HTTPS://SLIDESHOW.EXAMPLE.COM",
      "https://%73lideshow.example.com",
      "https://slideshow.example.com, https://evil.example",
      ["https://slideshow.example.com", "https://evil.example"]
    ]) {
      expect(isAllowedOrigin(origin, configuredOrigin)).toBe(false);
    }
  });

  it("rejects sibling hosts, subdomains, wrong ports, schemes, and URL components", () => {
    for (const origin of [
      "https://example.com",
      "https://admin.slideshow.example.com",
      "https://slideshow.example.com:444",
      "http://slideshow.example.com",
      "https://user@slideshow.example.com",
      "https://slideshow.example.com/login",
      "https://slideshow.example.com?x=1",
      "https://slideshow.example.com#fragment"
    ]) {
      expect(isAllowedOrigin(origin, configuredOrigin)).toBe(false);
    }
  });
});
