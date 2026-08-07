import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/server/app.js";
import { resolveAppMode } from "../../src/server/runtime.js";

describe("runtime mode", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
  afterEach(async () => Promise.all(apps.map((app) => app.close())));

  it("selects development only when explicitly requested", () => {
    expect(resolveAppMode("development")).toBe("development");
    expect(resolveAppMode(undefined)).toBe("production");
  });

  it("wires development and production commands to explicit modes", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8")
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["dev:server"]).toMatch(/^NODE_ENV=development /);
    expect(packageJson.scripts.start).toMatch(/^NODE_ENV=production /);
  });

  it("enables Fastify logging only in production", async () => {
    const developmentApp = await buildApp({ mode: "development" });
    const productionApp = await buildApp({ mode: "production" });
    apps.push(developmentApp, productionApp);

    expect(developmentApp.log.level).toBeUndefined();
    expect(productionApp.log.level).toBe("info");
  });
});
