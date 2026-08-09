import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlaylist, getWelcomeCopy, login, loginWithFamilyLink } from "../../src/client/api.js";

describe("client API requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not label an empty playlist request as JSON", async () => {
    let request: RequestInit | undefined;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      request = init;
      return new Response(JSON.stringify({ playlistId: "p", photoDurationMs: 7000, items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await createPlaylist();

    expect(request?.body).toBe("");
    expect(new Headers(request?.headers).has("content-type")).toBe(false);
  });

  it("keeps the JSON header for requests with a JSON body", async () => {
    let request: RequestInit | undefined;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      request = init;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    });

    await login("family", "secret");

    expect(new Headers(request?.headers).get("content-type")).toBe("application/json");
  });

  it("exchanges a private family-link token using same-origin credentials", async () => {
    let url: RequestInfo | URL | undefined;
    let request: RequestInit | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      url = input;
      request = init;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    });

    const token = "ab".repeat(32);
    await loginWithFamilyLink(token);

    expect(url).toBe("/api/auth/family-link");
    expect(request).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ token })
    });
    expect(new Headers(request?.headers).get("content-type")).toBe("application/json");
  });

  it("fetches family-only welcome copy", async () => {
    let url: RequestInfo | URL | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      url = input;
      return new Response(JSON.stringify({ eyebrow: "A little story", title: "From the beginning", body: "Small moments, held close." }), { status: 200, headers: { "content-type": "application/json" } });
    });

    await getWelcomeCopy();

    expect(url).toBe("/api/welcome");
  });
});
