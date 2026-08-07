import { afterEach, describe, expect, it, vi } from "vitest";

import { createPlaylist, login } from "../../src/client/api.js";

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
});
