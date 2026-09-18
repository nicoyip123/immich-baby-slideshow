import cookie from "@fastify/cookie";
import staticPlugin from "@fastify/static";
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from "fastify";
import { resolve } from "node:path";
import type { AppConfig } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { registerAuthRoutes, type AuthGuards } from "./routes/auth.js";
import { playlistRoutes } from "./routes/playlist.js";
import { mediaRoutes } from "./routes/media.js";
import { publicConfigRoutes } from "./routes/public-config.js";
import { statsRoutes } from "./routes/stats.js";
import { welcomeRoutes } from "./routes/welcome.js";
import { createFailedLoginLimiter, createImmediatePermitPool } from "./security/login-attempts.js";
import {
  deriveFamilyLinkSessionSecret,
  FAMILY_LINK_SESSION_DURATION_SECONDS
} from "./security/family-link.js";
import { verifyPassword } from "./security/password.js";
import { createSessionCodec } from "./security/session.js";
import { ImmichClient, type ImmichPort } from "./immich/client.js";
import { createImpressionCodec } from "./slideshow/impressions.js";
import { createStatsDatabase, type StatsDatabase } from "./stats/database.js";

export type AppMode = "test" | "development" | "production";
const processPasswordVerificationPermits = createImmediatePermitPool();

export interface AppDependencies {
  now?: () => number;
  generateNonce?: () => Buffer;
  verifyPassword?: (password: string, storedHash: string) => Promise<boolean>;
  maxConcurrentPasswordVerifications?: number;
  immich?: ImmichPort;
  statsDatabase?: StatsDatabase;
}

export interface BuildAppOptions {
  mode: AppMode;
  config?: AppConfig;
  dependencies?: AppDependencies;
  logger?: FastifyServerOptions["logger"];
  registerRoutes?: (app: FastifyInstance, guards: AuthGuards) => void | Promise<void>;
}

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({
    logger: options.logger ?? options.mode === "production",
    // Trust only startup-validated literal proxy ranges; the default ignores XFF.
    trustProxy: options.config?.trustedProxyCidrs.length
      ? options.config.trustedProxyCidrs
      : false
  });
  app.addHook("onSend", async (_request, reply, payload) => {
    const analyticsEnabled = Boolean(options.config?.ga4MeasurementId);
    const googleScript = analyticsEnabled ? " https://www.googletagmanager.com" : "";
    const googleImages = analyticsEnabled ? " https://*.google-analytics.com https://www.googletagmanager.com" : "";
    const googleConnections = analyticsEnabled ? " https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com" : "";
    reply.header("content-security-policy", `default-src 'self'; img-src 'self' data:${googleImages}; media-src 'self' blob:; style-src 'self'; script-src 'self'${googleScript}; connect-src 'self'${googleConnections}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header("x-frame-options", "DENY");
    return payload;
  });
  await app.register(healthRoutes);

  if (options.config) {
    await app.register(cookie);
    const now = options.dependencies?.now ?? Date.now;
    const sessions = createSessionCodec({
      secret: options.config.sessionSecret,
      durationSeconds: options.config.sessionDurationSeconds,
      now,
      generateNonce: options.dependencies?.generateNonce
    });
    const familyLink = options.config.familyLinkTokenHash === undefined
      ? undefined
      : {
          tokenHash: options.config.familyLinkTokenHash,
          sessions: createSessionCodec({
            secret: deriveFamilyLinkSessionSecret(
              options.config.sessionSecret,
              options.config.familyLinkTokenHash
            ),
            durationSeconds: FAMILY_LINK_SESSION_DURATION_SECONDS,
            now,
            generateNonce: options.dependencies?.generateNonce
          })
        };
    const guards = await registerAuthRoutes(app, {
      config: options.config,
      sessions,
      familyLink,
      familyLinkFailedLogins: createFailedLoginLimiter({ now }),
      failedLogins: createFailedLoginLimiter({ now }),
      passwordVerificationPermits:
        options.dependencies?.maxConcurrentPasswordVerifications === undefined
          ? processPasswordVerificationPermits
          : createImmediatePermitPool(options.dependencies.maxConcurrentPasswordVerifications),
      verifyPassword: options.dependencies?.verifyPassword ?? verifyPassword
    });
    const immich = options.dependencies?.immich ?? new ImmichClient({ baseUrl: options.config.immichUrl, apiKey: options.config.immichApiKey });
    const database = options.dependencies?.statsDatabase ?? createStatsDatabase(options.mode === "test" ? ":memory:" : options.config.databasePath);
    const impressions = createImpressionCodec({ secret: options.config.sessionSecret, now });
    app.addHook("onClose", async () => database.close());
    await publicConfigRoutes(app, options.config);
    await welcomeRoutes(app, { family: guards.requireFamilySession });
    await playlistRoutes(app, { config: options.config, immich, impressions, family: guards.requireFamilySession });
    await mediaRoutes(app, { immich, soundtrackPath: options.config.soundtrackPath, family: guards.requireFamilySession, admin: guards.requireAdminSession });
    await statsRoutes(app, { origin: options.config.publicOrigin, database, impressions, family: guards.requireFamilySession, admin: guards.requireAdminSession });
    await options.registerRoutes?.(app, guards);
  }

  if (options.mode === "production") {
    await app.register(staticPlugin, { root: resolve("dist/client"), prefix: "/", wildcard: false, maxAge: "1y", immutable: true });
    app.get("/*", async (request, reply) => request.url.startsWith("/api/") ? reply.code(404).send({ error: "Not found" }) : reply.header("cache-control", "no-cache").sendFile("index.html"));
  }

  app.setErrorHandler((error, _request, reply) => {
    if (reply.sent) return;
    app.log.error({ err: error }, "Request failed");
    const statusCode = (error as FastifyError).statusCode;
    return reply.code(statusCode && statusCode < 500 ? statusCode : 500).send({ code: "INTERNAL_ERROR" });
  });

  return app;
}
