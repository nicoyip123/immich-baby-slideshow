import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { AppConfig } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { registerAuthRoutes, type AuthGuards } from "./routes/auth.js";
import { createFailedLoginLimiter } from "./security/login-attempts.js";
import { verifyPassword } from "./security/password.js";
import { createSessionCodec } from "./security/session.js";

export type AppMode = "test" | "development" | "production";

export interface AppDependencies {
  now?: () => number;
  generateNonce?: () => Buffer;
  verifyPassword?: (password: string, storedHash: string) => Promise<boolean>;
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
    // Cloudflare/proxy trust must be configured deliberately at deployment time.
    // Never accept arbitrary X-Forwarded-For as the rate-limit identity by default.
    trustProxy: false
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
    const guards = await registerAuthRoutes(app, {
      config: options.config,
      sessions,
      failedLogins: createFailedLoginLimiter({ now }),
      verifyPassword: options.dependencies?.verifyPassword ?? verifyPassword
    });
    await options.registerRoutes?.(app, guards);
  }

  return app;
}
