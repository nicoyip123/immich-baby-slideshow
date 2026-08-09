import { afterEach, describe, expect, it } from "vitest";
import { createConnection } from "node:net";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { buildApp, type BuildAppOptions } from "../../src/server/app.js";
import type { AppConfig } from "../../src/server/config.js";
import { hashFamilyLinkToken } from "../../src/server/security/family-link.js";

const publicOrigin = "https://slideshow.example.com";
const familyHash = "family-hash-leak-marker";
const adminHash = "admin-hash-leak-marker";
const sessionSecret = "session-secret-leak-marker-at-least-32-characters";
const familyLinkToken = "ab".repeat(32);
const familyLinkTokenHash = hashFamilyLinkToken(familyLinkToken);
const rotatedFamilyLinkToken = "cd".repeat(32);
const rotatedFamilyLinkTokenHash = hashFamilyLinkToken(rotatedFamilyLinkToken);

const config: AppConfig = {
  immichUrl: "http://immich-server:2283",
  immichApiKey: "immich-api-key-with-at-least-20-characters",
  immichAlbumId: "7f2a70a8-0f37-4b39-9d97-46d26d53f210",
  familyPasswordHash: familyHash,
  adminPasswordHash: adminHash,
  babyBirthDate: "2025-08-07",
  timezone: "Australia/Melbourne",
  sessionSecret,
  publicOrigin,
  trustedProxyCidrs: [],
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
      name: "invalid content length",
      headers: { "content-type": "application/json", "content-length": "100" },
      payload: "{}"
    },
    {
      name: "unsupported content type",
      headers: { "content-type": "application/xml" },
      payload: "<password>secret</password>"
    },
    {
      name: "oversized JSON body",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ password: "x".repeat(8192) })
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

function malformedFamilyLinkRequests() {
  return [
    {
      name: "empty JSON body",
      headers: { "content-type": "application/json" },
      payload: ""
    },
    {
      name: "invalid content length",
      headers: { "content-type": "application/json", "content-length": "100" },
      payload: "{}"
    },
    {
      name: "unsupported content type",
      headers: { "content-type": "application/xml" },
      payload: `<token>${familyLinkToken}</token>`
    },
    {
      name: "oversized JSON body",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token: "x".repeat(8192) })
    },
    {
      name: "malformed JSON body",
      headers: { "content-type": "application/json" },
      payload: '{"token":'
    },
    {
      name: "missing token",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({})
    },
    {
      name: "empty token",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token: "" })
    },
    {
      name: "non-string token",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token: 123 })
    },
    {
      name: "non-canonical token",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token: familyLinkToken.toUpperCase() })
    },
    {
      name: "extra property",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ token: familyLinkToken, extra: true })
    }
  ];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("authentication boundary", () => {
  const apps: TestApp[] = [];
  let now = Date.UTC(2026, 7, 7, 12, 0, 0);

  async function makeApp(options: {
    mode?: "test" | "production";
    logger?: BuildAppOptions["logger"];
    probes?: boolean;
    trustedProxyCidrs?: string[];
    familyLinkTokenHash?: string;
    maxConcurrentPasswordVerifications?: number;
    verifyPassword?: (password: string, hash: string) => Promise<boolean>;
  } = {}): Promise<TestApp> {
    const app = await buildApp({
      mode: options.mode ?? "test",
      config: {
        ...config,
        trustedProxyCidrs: options.trustedProxyCidrs ?? [],
        familyLinkTokenHash: options.familyLinkTokenHash
      },
      logger: options.logger,
      dependencies: {
        now: () => now,
        generateNonce: () => Buffer.alloc(24, 9),
        verifyPassword: options.verifyPassword ?? (async (password: string, hash: string) => testPasswords.get(hash) === password),
        maxConcurrentPasswordVerifications: options.maxConcurrentPasswordVerifications
      },
      registerRoutes: options.probes
        ? async (instance, guards) => {
            instance.get("/probe/family", { preHandler: guards.requireFamilySession }, async () => ({ ok: true }));
            instance.get("/probe/admin", { preHandler: guards.requireAdminSession }, async () => ({ ok: true }));
            instance.get("/probe/ip", async (request) => ({ ip: request.ip }));
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

  async function exchangeFamilyLink(
    app: TestApp,
    token: string,
    remoteAddress = "192.0.2.1"
  ) {
    return app.inject({
      method: "POST",
      url: "/api/auth/family-link",
      headers: { origin: publicOrigin },
      payload: { token },
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

  it("exchanges the exact family-link token for a hardened 30-day family-only session", async () => {
    const app = await makeApp({ familyLinkTokenHash, probes: true });
    const response = await exchangeFamilyLink(app, familyLinkToken);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    const setCookie = setCookieHeader(response);
    expect(setCookie).toContain("family_session=");
    expect(setCookie).not.toContain("admin_session=");
    expect(setCookie).toMatch(/Max-Age=2592000/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);

    const familyCookie = cookiePair(setCookie);
    const familySession = familyCookie.slice("family_session=".length);
    expect((await app.inject({
      url: "/api/auth/family/status",
      headers: { cookie: familyCookie }
    })).json()).toEqual({ authenticated: true });
    expect((await app.inject({
      url: "/probe/family",
      headers: { cookie: familyCookie }
    })).statusCode).toBe(200);
    expect((await app.inject({
      url: "/api/auth/admin/status",
      headers: { cookie: `admin_session=${familySession}` }
    })).json()).toEqual({ authenticated: false });
    expect((await app.inject({
      url: "/probe/admin",
      headers: { cookie: `admin_session=${familySession}` }
    })).statusCode).toBe(401);

    now += 2_592_000 * 1000 - 1;
    expect((await app.inject({
      url: "/api/auth/family/status",
      headers: { cookie: familyCookie }
    })).json()).toEqual({ authenticated: true });
    now += 1;
    expect((await app.inject({
      url: "/api/auth/family/status",
      headers: { cookie: familyCookie }
    })).json()).toEqual({ authenticated: false });

    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/family/logout",
      headers: { origin: publicOrigin, cookie: familyCookie }
    });
    expect(logout.statusCode).toBe(200);
    expect(setCookieHeader(logout)).toMatch(/family_session=.*Max-Age=0/i);
  });

  it("returns only generic failures for wrong and malformed family-link exchanges", async () => {
    const app = await makeApp({ familyLinkTokenHash });
    const wrongToken = "ef".repeat(32);
    const wrong = await exchangeFamilyLink(app, wrongToken, "192.0.2.100");
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: "Authentication failed" });
    expect(wrong.body).not.toContain(wrongToken);
    expect(wrong.headers["cache-control"]).toBe("private, no-store");

    let client = 101;
    for (const malformed of malformedFamilyLinkRequests()) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/family-link",
        headers: { origin: publicOrigin, ...malformed.headers },
        payload: malformed.payload,
        remoteAddress: `192.0.2.${client++}`
      });
      expect({ name: malformed.name, statusCode: response.statusCode, body: response.json() }).toEqual({
        name: malformed.name,
        statusCode: 400,
        body: { error: "Authentication failed" }
      });
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.body).not.toContain(familyLinkToken);
      expect(response.body).not.toContain(familyLinkTokenHash);
    }
  });

  it("requires the exact configured Origin for family-link exchange", async () => {
    const app = await makeApp({ familyLinkTokenHash });
    for (const origin of [
      undefined,
      "null",
      "https://evil.example",
      "http://slideshow.example.com",
      "https://slideshow.example.com:444",
      "https://slideshow.example.com, https://evil.example"
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/family-link",
        headers: origin === undefined ? {} : { origin },
        payload: { token: familyLinkToken }
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "Request not allowed" });
      expect(response.body).not.toContain(familyLinkToken);
    }
    expect((await exchangeFamilyLink(app, familyLinkToken)).statusCode).toBe(200);
  });

  it("rate-limits family-link failures without consuming the password-login quota", async () => {
    const app = await makeApp({ familyLinkTokenHash });
    const remoteAddress = "192.0.2.120";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await exchangeFamilyLink(app, "ef".repeat(32), remoteAddress);
      expect(response.statusCode).toBe(401);
    }
    const limited = await exchangeFamilyLink(app, familyLinkToken, remoteAddress);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: "Please try again later" });

    const passwordLogin = await login(app, "family", "family secret", remoteAddress);
    expect(passwordLogin.statusCode).toBe(200);
  });

  it("admits only one same-IP family-link exchange while its body is still parsing", async () => {
    const app = await makeApp({ familyLinkTokenHash });
    const remoteAddress = "192.0.2.121";
    const wrongToken = "ef".repeat(32);
    const payload = new PassThrough();
    const first = app.inject({
      method: "POST",
      url: "/api/auth/family-link",
      headers: { origin: publicOrigin, "content-type": "application/json" },
      payload,
      remoteAddress
    });
    payload.write('{"token":"');
    await new Promise((resolve) => setImmediate(resolve));

    const concurrent = await Promise.all(
      Array.from({ length: 24 }, () => exchangeFamilyLink(app, wrongToken, remoteAddress))
    );
    expect(concurrent.map((response) => response.statusCode)).toEqual(
      Array.from({ length: 24 }, () => 429)
    );

    payload.end(`${wrongToken}"}`);
    expect((await first).statusCode).toBe(401);
    expect((await exchangeFamilyLink(app, familyLinkToken, remoteAddress)).statusCode).toBe(200);
  });

  it("releases family-link admission after success and parser failures", async () => {
    const app = await makeApp({ familyLinkTokenHash });
    expect((await exchangeFamilyLink(app, familyLinkToken, "192.0.2.122")).statusCode).toBe(200);
    expect((await exchangeFamilyLink(app, familyLinkToken, "192.0.2.122")).statusCode).toBe(200);

    const malformed = await app.inject({
      method: "POST",
      url: "/api/auth/family-link",
      headers: { origin: publicOrigin, "content-type": "application/json" },
      payload: '{"token":',
      remoteAddress: "192.0.2.123"
    });
    expect(malformed.statusCode).toBe(400);
    expect((await exchangeFamilyLink(app, familyLinkToken, "192.0.2.123")).statusCode).toBe(200);
  });

  it("releases family-link admission when a client aborts during body upload", async () => {
    const app = await makeApp({ familyLinkTokenHash });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as AddressInfo;

    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host: "127.0.0.1", port: address.port });
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.write([
          "POST /api/auth/family-link HTTP/1.1",
          `Host: 127.0.0.1:${address.port}`,
          `Origin: ${publicOrigin}`,
          "Content-Type: application/json",
          "Content-Length: 100",
          "Connection: close",
          "",
          '{"token":"partial'
        ].join("\r\n"));
        setTimeout(() => socket.destroy(), 10);
      });
      socket.once("close", () => resolve());
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect((await exchangeFamilyLink(app, familyLinkToken, "127.0.0.1")).statusCode).toBe(200);
  });

  it("makes disabled family-link failures indistinguishable and isolated from password login", async () => {
    const configured = await makeApp({ familyLinkTokenHash });
    const disabled = await makeApp();
    const remoteAddress = "192.0.2.124";
    const configuredFailure = await exchangeFamilyLink(
      configured,
      rotatedFamilyLinkToken,
      "192.0.2.125"
    );
    const disabledFailure = await exchangeFamilyLink(disabled, familyLinkToken, remoteAddress);

    expect({
      statusCode: disabledFailure.statusCode,
      body: disabledFailure.json(),
      cacheControl: disabledFailure.headers["cache-control"]
    }).toEqual({
      statusCode: configuredFailure.statusCode,
      body: configuredFailure.json(),
      cacheControl: configuredFailure.headers["cache-control"]
    });
    expect(disabledFailure.headers["set-cookie"]).toBeUndefined();

    for (let attempt = 1; attempt < 5; attempt += 1) {
      expect((await exchangeFamilyLink(disabled, familyLinkToken, remoteAddress)).statusCode).toBe(401);
    }
    const limited = await exchangeFamilyLink(disabled, familyLinkToken, remoteAddress);
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: "Please try again later" });
    expect((await login(disabled, "family", "family secret", remoteAddress)).statusCode).toBe(200);
  });

  it("revokes link sessions on hash rotation without invalidating password family sessions", async () => {
    const original = await makeApp({ familyLinkTokenHash });
    const rotated = await makeApp({ familyLinkTokenHash: rotatedFamilyLinkTokenHash, probes: true });
    const linkCookie = cookiePair(setCookieHeader(await exchangeFamilyLink(original, familyLinkToken)));
    const passwordCookie = cookiePair(setCookieHeader(await login(original, "family", "family secret")));

    expect((await rotated.inject({
      url: "/api/auth/family/status",
      headers: { cookie: linkCookie }
    })).json()).toEqual({ authenticated: false });
    expect((await rotated.inject({
      url: "/api/auth/family/status",
      headers: { cookie: passwordCookie }
    })).json()).toEqual({ authenticated: true });
    expect((await rotated.inject({
      url: "/probe/family",
      headers: { cookie: linkCookie }
    })).statusCode).toBe(401);
    expect((await rotated.inject({
      url: "/probe/family",
      headers: { cookie: passwordCookie }
    })).statusCode).toBe(200);
  });

  it("does not expose family-link tokens or hashes in response bodies or captured logs", async () => {
    let logs = "";
    const wrongToken = "ef".repeat(32);
    const app = await makeApp({
      mode: "production",
      familyLinkTokenHash,
      logger: {
        level: "info",
        stream: { write: (chunk: string) => { logs += chunk; } }
      }
    });
    const successful = await exchangeFamilyLink(app, familyLinkToken, "192.0.2.130");
    const failed = await exchangeFamilyLink(app, wrongToken, "192.0.2.131");
    const publicOutput = `${successful.body}\n${failed.body}\n${logs}`;

    expect(successful.statusCode).toBe(200);
    expect(failed.statusCode).toBe(401);
    for (const secret of [familyLinkToken, wrongToken, familyLinkTokenHash]) {
      expect(publicOutput).not.toContain(secret);
    }
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
    for (const malformed of malformedCredentialRequests().slice(0, 5)) {
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

  it("rejects a concurrent login for the same role/IP before another verification starts", async () => {
    const firstVerification = deferred<boolean>();
    const firstStarted = deferred<void>();
    let verificationCalls = 0;
    const app = await makeApp({
      verifyPassword: async () => {
        verificationCalls += 1;
        if (verificationCalls === 1) firstStarted.resolve();
        return verificationCalls === 1 ? firstVerification.promise : true;
      }
    });

    const first = login(app, "family", "family secret", "192.0.2.60");
    await firstStarted.promise;
    const concurrent = await login(app, "family", "family secret", "192.0.2.60");
    expect(concurrent.statusCode).toBe(429);
    expect(concurrent.json()).toEqual({ error: "Please try again later" });
    expect(verificationCalls).toBe(1);

    firstVerification.resolve(true);
    expect((await first).statusCode).toBe(200);
    expect((await login(app, "family", "family secret", "192.0.2.60")).statusCode).toBe(200);
    expect(verificationCalls).toBe(2);
  });

  it("releases per-IP admission when a client aborts during body upload", async () => {
    let verificationCalls = 0;
    const app = await makeApp({
      verifyPassword: async () => {
        verificationCalls += 1;
        return true;
      }
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address() as AddressInfo;

    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host: "127.0.0.1", port: address.port });
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.write([
          "POST /api/auth/family HTTP/1.1",
          `Host: 127.0.0.1:${address.port}`,
          `Origin: ${publicOrigin}`,
          "Content-Type: application/json",
          "Content-Length: 100",
          "Connection: close",
          "",
          '{"password":"partial'
        ].join("\r\n"));
        setTimeout(() => socket.destroy(), 10);
      });
      socket.once("close", () => resolve());
    });

    await new Promise((resolve) => setImmediate(resolve));
    const next = await login(app, "family", "family secret", "127.0.0.1");
    expect(next.statusCode).toBe(200);
    expect(verificationCalls).toBe(1);
  });

  it("bounds global verification concurrency and releases permits after false, throw, and success", async () => {
    const failed = deferred<boolean>();
    const thrown = deferred<boolean>();
    let verificationCalls = 0;
    const app = await makeApp({
      maxConcurrentPasswordVerifications: 2,
      verifyPassword: async () => {
        verificationCalls += 1;
        if (verificationCalls === 1) return failed.promise;
        if (verificationCalls === 2) return thrown.promise;
        return true;
      }
    });

    const first = login(app, "family", "family secret", "192.0.2.61");
    const second = login(app, "admin", "admin secret", "192.0.2.62");
    await Promise.resolve();
    await Promise.resolve();
    const saturated = await login(app, "family", "family secret", "192.0.2.63");
    expect(saturated.statusCode).toBe(429);
    expect(saturated.json()).toEqual({ error: "Please try again later" });
    expect(verificationCalls).toBe(2);

    failed.resolve(false);
    expect((await first).statusCode).toBe(401);
    expect((await login(app, "family", "family secret", "192.0.2.61")).statusCode).toBe(200);

    thrown.reject(new Error("verification failed"));
    expect((await second).statusCode).toBe(401);
    expect((await login(app, "admin", "admin secret", "192.0.2.62")).statusCode).toBe(200);
    expect((await login(app, "family", "family secret", "192.0.2.66")).statusCode).toBe(200);
    expect(verificationCalls).toBe(5);
  });

  it("shares the default verification permit bound across app compositions in the process", async () => {
    const pending = Array.from({ length: 4 }, () => deferred<boolean>());
    const fourStarted = deferred<void>();
    let verificationCalls = 0;
    const verifyPassword = async () => {
      verificationCalls += 1;
      if (verificationCalls === 4) fourStarted.resolve();
      return verificationCalls <= 4 ? pending[verificationCalls - 1]!.promise : true;
    };
    const firstApp = await makeApp({ verifyPassword });
    const secondApp = await makeApp({ verifyPassword });

    const active = [
      login(firstApp, "family", "family secret", "192.0.2.91"),
      login(firstApp, "admin", "admin secret", "192.0.2.92"),
      login(firstApp, "family", "family secret", "192.0.2.93"),
      login(firstApp, "admin", "admin secret", "192.0.2.94")
    ];
    await fourStarted.promise;

    const excess = await login(secondApp, "family", "family secret", "192.0.2.95");
    expect(excess.statusCode).toBe(429);
    expect(excess.json()).toEqual({ error: "Please try again later" });
    expect(verificationCalls).toBe(4);

    for (const attempt of pending) attempt.resolve(true);
    expect((await Promise.all(active)).map((response) => response.statusCode)).toEqual([200, 200, 200, 200]);
  });

  it("rejects overlong UTF-8 passwords before verification and counts them as failures", async () => {
    let verificationCalls = 0;
    const app = await makeApp({
      verifyPassword: async () => {
        verificationCalls += 1;
        return true;
      }
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/api/auth/family",
        headers: { origin: publicOrigin },
        payload: { password: "😀".repeat(257) },
        remoteAddress: "192.0.2.70"
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "Authentication failed" });
    }
    expect((await login(app, "family", "family secret", "192.0.2.70")).statusCode).toBe(429);
    expect(verificationCalls).toBe(0);
  });

  it("adds private no-store caching to success and failure auth responses", async () => {
    const app = await makeApp();
    const responses = [
      await app.inject({ url: "/api/auth/family/status" }),
      await login(app, "family", "wrong", "192.0.2.80"),
      await app.inject({ method: "POST", url: "/api/auth/family/logout", headers: { origin: publicOrigin } }),
      await app.inject({ method: "POST", url: "/api/auth/admin", payload: { password: "admin secret" } })
    ];
    for (const response of responses) {
      expect(response.headers["cache-control"]).toBe("private, no-store");
    }
  });

  it("rejects unnecessary bodies on status and logout routes", async () => {
    const app = await makeApp();
    const status = await app.inject({
      method: "GET",
      url: "/api/auth/family/status",
      headers: { "content-type": "text/plain" },
      payload: "x"
    });
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/admin/logout",
      headers: { origin: publicOrigin, "content-type": "text/plain" },
      payload: "x"
    });

    expect(status.statusCode).toBe(400);
    expect(logout.statusCode).toBe(400);
    expect(status.headers["cache-control"]).toBe("private, no-store");
    expect(logout.headers["cache-control"]).toBe("private, no-store");
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

  it("trusts forwarded client IPs only from configured IPv4 and IPv6 proxy ranges", async () => {
    const untrusted = await makeApp({ probes: true, trustedProxyCidrs: ["10.0.0.0/8"] });
    expect((await untrusted.inject({
      url: "/probe/ip",
      remoteAddress: "203.0.113.10",
      headers: { "x-forwarded-for": "198.51.100.20" }
    })).json()).toEqual({ ip: "203.0.113.10" });

    const trustedIpv4 = await makeApp({ probes: true, trustedProxyCidrs: ["10.0.0.0/8"] });
    expect((await trustedIpv4.inject({
      url: "/probe/ip",
      remoteAddress: "10.1.2.3",
      headers: { "x-forwarded-for": "198.51.100.20, 10.9.8.7" }
    })).json()).toEqual({ ip: "198.51.100.20" });

    const trustedIpv6 = await makeApp({ probes: true, trustedProxyCidrs: ["fd00::/8"] });
    expect((await trustedIpv6.inject({
      url: "/probe/ip",
      remoteAddress: "fd00::1",
      headers: { "x-forwarded-for": "2001:db8::123" }
    })).json()).toEqual({ ip: "2001:db8::123" });
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
