import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";

describe("GET /health", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.map((app) => app.close())));

  it("returns an uncredentialed liveness response", async () => {
    const app = await buildApp({ mode: "test" });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
