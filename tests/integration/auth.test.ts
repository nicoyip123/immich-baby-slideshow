import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type BuildAppOptions } from "../../src/server/app.js";
import type { AppConfig } from "../../src/server/config.js";

const publicOrigin = "https://slideshow.example.com";
const familyHash = "family-hash-leak-marker";
const adminHash = "admin-hash-leak-marker";
const sessionSecret = "session-secret-leak-marker-at-least-32-characters";

const config: AppConfig = {
  immichUrl: "http://immich-server:2283",
  immichApiKey: "immich-api-key-with-at-least-20-characters",
  familyPasswordHash: familyHash,
  adminPasswordHash: adminHash,
  babyBirthDate: "2025-08-07",
  timezone: "Australia/Melbourne",
  sessionSecret,
  publicOrigin,
  databasePath: "/tmp/test.sqlite",
  soundtrackPath: "/tmp/test.mp3",
  ga4MeasurementId: undefined,
  photoDurationMs: 7000,
  sessionDurationSeconds: 600
};

const testPasswords = new Map([
  [familyHash, "family secret"],
  [adminHash, "admin secret"]
]);

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function cookiePair(setCookie: string): string {
  return setCookie.split(";", 1)[0]!;
}

function setCookieHeader(response: { headers: Record<string, string | string[] | number | undefined> }): string {
  const value = response.headers["set-cookie"];
  expect(value).toBeDefined();
  if (Array.isArray(value)) return value[0]!;
  expect(typeof value).toBe("string");
  return String(value);
}

function malformedCredentialRequests() {
  return [
    {
      name: "empty JSON body",
      headers: { "content-type": "application/json" },
      payload: ""
    },
    {
      name: "unsupported content type",
      headers: { "content-type": "application/xml" },
      payload: "<password>secret</password>"
    },
    {
      name: "oversized JSON body",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ password: "x".repeat(1024 * 1024) })
    },
    {
      name: "malformed JSON body",
      headers: { "content-type": "application/json" },
      payload: '{"password":'
    },
    {
      name: "schema-invalid JSON body",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ password: 123 })
    }
  ];
}

describe("authentication boundary", () => {
  const apps: TestApp[] = [];
  let now = Date.UTC(2026, 7, 7, 12, 0, 0);

  async function makeApp(options: {
    mode?: "test" | "production";
    logger?: BuildAppOptions["logger"];
    probes?: boolean;
  } = {}): Promise<TestApp> {
    const app = await buildApp({
      mode: options.mode ?? "test",
      config,
      logger: options.logger,
      dependencies: {
        now: () => now,
        generateNonce: () => Buffer.alloc(24, 9),
        verifyPassword: async (password: string, hash: string) => testPasswords.get(hash) === password
      },
      registerRoutes: options.probes
        ? async (instance, guards) => {
            instance.get("/probe/family", { preHandler: guards.requireFamilySession }, async () => ({ ok: true }));
            instance.get("/probe/admin", { preHandler: guards.requireAdminSession }, async () => ({ ok: true }));
          }
        : undefined
    });
    apps.push(app);
    return app;
  }

  async function login(
    app: TestApp,
    role: "family" | "admin",
    password: string,
    remoteAddress = "192.0.2.1"
  ) {
    return app.inject({
      method: "POST",
      url: `/api/auth/${role}`,
      headers: { origin: publicOrigin },
      payload: { password },
      remoteAddress
    });
  }

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    now = Date.UTC(2026, 7, 7, 12, 0, 0);
  });

  it("sets only the correct hardened cookie for family and admin logins", async () => {
    const app = await makeApp();
    const familyResponse = await login(app, "family", "family secret");
    const adminResponse = await login(app, "admin", "admin secret");

    expect(familyResponse.statusCode).toBe(200);
    expect(familyResponse.json()).toEqual({ success: true });
    const familyCookie = setCookieHeader(familyResponse);
    expect(familyCookie).toContain("family_session=");
    expect(familyCookie).not.toContain("admin_session=");
    expect(familyCookie).toMatch(/Max-Age=600/i);
    expect(familyCookie).toMatch(/Path=\//i);
    expect(familyCookie).toMatch(/HttpOnly/i);
    expect(familyCookie).toMatch(/Secure/i);
    expect(familyCookie).toMatch(/SameSite=Strict/i);

    expect(adminResponse.statusCode).toBe(200);
    const adminCookie = setCookieHeader(adminResponse);
    expect(adminCookie).toContain("admin_session=");
    expect(adminCookie).not.toContain("family_session=");
  });

  it("returns the same public failure for invalid and malformed credentials", async () => {
    const app = await makeApp();
    const invalid = await login(app, "family", "wrong password");
    const malformed = await app.inject({
      method: "POST",
      url: "/api/auth/family",
      headers: { origin: publicOrigin },
      payload: { password: 123 }
    });
    const malformedJson = await app.inject({
      method: "POST",
      url: "/api/auth/family",
      headers: { origin: publicOrigin, "content-type": "application/json" },
      payload: '{"password":'
    });

    expect(invalid.statusCode).toBe(401);
    expect(malformed.statusCode).toBe(400);
    expect(malformedJson.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: "Authentication failed" });
    expect(malformed.json()).toEqual({ error: "Authentication failed" });
    expect(malformedJson.json()).toEqual({ error: "Authentication failed" });
  });

  it("returns 429 for the sixth same-role, same-IP failure and recovers after the window", async () => {
    const app = await makeApp();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect((await login(app, "family", "wrong", "192.0.2.1")).statusCode).toBe(401);
    }
    const limited = await login(app, "family", "wrong", "192.0.2.1");
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: "Please try again later" });

    now += 15 * 60 * 1000;
    expect((await login(app, "family", "wrong", "192.0.2.1")).statusCode).toBe(401);
  });

  it("maps every malformed credential request to the same generic failure for both roles", async () => {
    const app = await makeApp();
    let client = 10;
    const actual: Array<{ role: string; name: string; statusCode: number; body: unknown }> = [];
    for (const role of ["family", "admin"] as const) {
      for (const malformed of malformedCredentialRequests()) {
        const response = await app.inject({
          method: "POST",
          url: `/api/auth/${role}`,
          headers: { origin: publicOrigin, ...malformed.headers },
          payload: malformed.payload,
          remoteAddress: `192.0.2.${client++}`
        });
        actual.push({
          role,
          name: malformed.name,
          statusCode: response.statusCode,
          body: response.json()
        });
      }
    }
    expect(actual).toEqual(
      ["family", "admin"].flatMap((role) =>
        malformedCredentialRequests().map(({ name }) => ({
          role,
          name,
          statusCode: 400,
          body: { error: "Authentication failed" }
        }))
      )
    );
  });

  it("counts mixed malformed credential requests toward the shared role/IP quota", async () => {
    const app = await makeApp();
    const firstFive: Array<{ statusCode: number; body: unknown }> = [];
    for (const malformed of malformedCredentialRequests()) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/admin",
        headers: { origin: publicOrigin, ...malformed.headers },
        payload: malformed.payload,
        remoteAddress: "192.0.2.50"
      });
      firstFive.push({ statusCode: response.statusCode, body: response.json() });
    }

    const limited = await app.inject({
      method: "POST",
      url: "/api/auth/admin",
      headers: { origin: publicOrigin, "content-type": "application/json" },
      payload: '{"password":',
      remoteAddress: "192.0.2.50"
    });
    expect({ firstFive, sixth: { statusCode: limited.statusCode, body: limited.json() } }).toEqual({
      firstFive: Array.from({ length: 5 }, () => ({
        statusCode: 400,
        body: { error: "Authentication failed" }
      })),
      sixth: { statusCode: 429, body: { error: "Please try again later" } }
    });
  });

  it("clears failures on success and isolates counters by role and request.ip", async () => {
    const app = await makeApp();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await login(app, "family", "wrong", "192.0.2.1");
    }
    expect((await login(app, "family", "family secret", "192.0.2.1")).statusCode).toBe(200);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await login(app, "family", "wrong", "192.0.2.1")).statusCode).toBe(401);
    }

    await login(app, "family", "wrong", "192.0.2.1");
    expect((await login(app, "family", "wrong", "192.0.2.1")).statusCode).toBe(429);
    expect((await login(app, "admin", "wrong", "192.0.2.1")).statusCode).toBe(401);
    expect((await login(app, "family", "wrong", "192.0.2.2")).statusCode).toBe(401);
  });

  it("requires the exact configured Origin on POST routes but not GET status routes", async () => {
    const app = await makeApp();
    for (const origin of [
      undefined,
      "null",
      "https://evil.example",
      "https://admin.slideshow.example.com",
      "http://slideshow.example.com",
      "https://slideshow.example.com:444",
      "https://slideshow.example.com, https://evil.example"
    ]) {
      const headers = origin === undefined ? {} : { origin };
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/family",
        headers,
        payload: { password: "family secret" }
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Request not allowed" });
    }

    expect((await login(app, "family", "family secret")).statusCode).toBe(200);
    const status = await app.inject({ method: "GET", url: "/api/auth/family/status" });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({ authenticated: false });

    const malformedWithoutOrigin = await app.inject({
      method: "POST",
      url: "/api/auth/family",
      headers: { "content-type": "application/json" },
      payload: '{"password":'
    });
    expect(malformedWithoutOrigin.statusCode).toBe(403);
    expect(malformedWithoutOrigin.json()).toEqual({ error: "Request not allowed" });
  });

  it("keeps family/admin status and reusable guards role-isolated", async () => {
    const app = await makeApp({ probes: true });
    const familyLogin = await login(app, "family", "family secret");
    const familyCookie = cookiePair(setCookieHeader(familyLogin));
    const familyToken = familyCookie.slice("family_session=".length);

    expect(
      (await app.inject({ url: "/api/auth/family/status", headers: { cookie: familyCookie } })).json()
    ).toEqual({ authenticated: true });
    expect(
      (await app.inject({ url: "/api/auth/admin/status", headers: { cookie: familyCookie } })).json()
    ).toEqual({ authenticated: false });
    expect(
      (await app.inject({ url: "/api/auth/admin/status", headers: { cookie: `admin_session=${familyToken}` } })).json()
    ).toEqual({ authenticated: false });
    expect(
      (await app.inject({ url: "/probe/family", headers: { cookie: familyCookie } })).statusCode
    ).toBe(200);
    expect(
      (await app.inject({ url: "/probe/admin", headers: { cookie: familyCookie } })).statusCode
    ).toBe(401);

    const adminLogin = await login(app, "admin", "admin secret");
    const adminCookie = cookiePair(setCookieHeader(adminLogin));
    expect((await app.inject({ url: "/probe/admin", headers: { cookie: adminCookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: "/probe/family", headers: { cookie: adminCookie } })).statusCode).toBe(401);
  });

  it("logout clears only the matching cookie with matching security attributes", async () => {
    const app = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/family/logout",
      headers: {
        origin: publicOrigin,
        cookie: "family_session=token; admin_session=other-token"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    const cleared = setCookieHeader(response);
    expect(cleared).toContain("family_session=");
    expect(cleared).not.toContain("admin_session=");
    expect(cleared).toMatch(/Max-Age=0/i);
    expect(cleared).toMatch(/Path=\//i);
    expect(cleared).toMatch(/HttpOnly/i);
    expect(cleared).toMatch(/Secure/i);
    expect(cleared).toMatch(/SameSite=Strict/i);
  });

  it("does not expose passwords, hashes, or the session secret in bodies or logs", async () => {
    let logs = "";
    const password = "password-leak-marker";
    const app = await makeApp({
      mode: "production",
      logger: {
        level: "info",
        stream: { write: (chunk: string) => { logs += chunk; } }
      }
    });
    const response = await login(app, "family", password);
    const publicOutput = `${response.body}\n${logs}`;

    expect(response.statusCode).toBe(401);
    for (const secret of [password, familyHash, adminHash, sessionSecret]) {
      expect(publicOutput).not.toContain(secret);
    }
  });
});
