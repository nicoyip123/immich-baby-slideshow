import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  onRequestHookHandler,
  onResponseHookHandler,
  onSendHookHandler,
  preHandlerHookHandler
} from "fastify";
import type { AppConfig } from "../config.js";
import {
  FAMILY_LINK_SESSION_DURATION_SECONDS,
  isFamilyLinkToken,
  verifyFamilyLinkToken
} from "../security/family-link.js";
import type { FailedLoginLimiter, ImmediatePermitPool } from "../security/login-attempts.js";
import { requireConfiguredOrigin } from "../security/origin.js";
import type { SessionCodec, SessionRole } from "../security/session.js";

export const FAMILY_SESSION_COOKIE = "family_session";
export const ADMIN_SESSION_COOKIE = "admin_session";

const AUTHENTICATION_FAILURE_BODY = Object.freeze({ error: "Authentication failed" });
const AUTHENTICATION_REQUIRED_BODY = Object.freeze({ error: "Authentication required" });
const RATE_LIMIT_BODY = Object.freeze({ error: "Please try again later" });
const SUCCESS_BODY = Object.freeze({ success: true });
const MALFORMED_CREDENTIAL_ERROR_CODES = new Set([
  "FST_ERR_CTP_BODY_TOO_LARGE",
  "FST_ERR_CTP_EMPTY_JSON_BODY",
  "FST_ERR_CTP_INVALID_JSON_BODY",
  "FST_ERR_CTP_INVALID_CONTENT_LENGTH",
  "FST_ERR_CTP_INVALID_MEDIA_TYPE"
]);

export interface AuthGuards {
  requireFamilySession: preHandlerHookHandler;
  requireAdminSession: preHandlerHookHandler;
}

export interface AuthRouteOptions {
  config: AppConfig;
  sessions: SessionCodec;
  familyLink?: {
    tokenHash: string;
    sessions: SessionCodec;
  };
  familyLinkFailedLogins: FailedLoginLimiter;
  failedLogins: FailedLoginLimiter;
  passwordVerificationPermits: ImmediatePermitPool;
  verifyPassword: (password: string, storedHash: string) => Promise<boolean>;
}

function cookieNameFor(role: SessionRole): string {
  return role === "family" ? FAMILY_SESSION_COOKIE : ADMIN_SESSION_COOKIE;
}

function storedHashFor(config: AppConfig, role: SessionRole): string {
  return role === "family" ? config.familyPasswordHash : config.adminPasswordHash;
}

function readCredential(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 1 && keys[0] === "password" && typeof record.password === "string"
    ? record.password
    : undefined;
}

function readFamilyLinkToken(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 1 && keys[0] === "token" && typeof record.token === "string" && isFamilyLinkToken(record.token)
    ? record.token
    : undefined;
}

function sessionGuard(role: SessionRole, sessions: SessionCodec): preHandlerHookHandler {
  return async (request, reply) => {
    const token = request.cookies[cookieNameFor(role)];
    if (!token || !sessions.verify(token, role)) {
      return reply.code(401).send(AUTHENTICATION_REQUIRED_BODY);
    }
  };
}

function verifyFamilySession(
  token: string,
  sessions: SessionCodec,
  familyLinkSessions?: SessionCodec
): boolean {
  return sessions.verify(token, "family") || (familyLinkSessions?.verify(token, "family") ?? false);
}

/** Reusable family-session guard for later playlist and media routes. */
export function requireFamilySession(
  sessions: SessionCodec,
  familyLinkSessions?: SessionCodec
): preHandlerHookHandler {
  return async (request, reply) => {
    const token = request.cookies[FAMILY_SESSION_COOKIE];
    if (!token || !verifyFamilySession(token, sessions, familyLinkSessions)) {
      return reply.code(401).send(AUTHENTICATION_REQUIRED_BODY);
    }
  };
}

/** Reusable admin-session guard for later statistics routes. */
export function requireAdminSession(sessions: SessionCodec): preHandlerHookHandler {
  return sessionGuard("admin", sessions);
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthRouteOptions
): Promise<AuthGuards> {
  const originGuard = requireConfiguredOrigin(options.config.publicOrigin);
  const inFlightKeys = new Set<string>();
  const inFlightReleases = new WeakMap<FastifyRequest, () => void>();
  const noStore: onSendHookHandler = async (_request, reply, payload) => {
    reply.header("cache-control", "private, no-store");
    return payload;
  };
  const rejectRequestBody: onRequestHookHandler = async (request, reply) => {
    if (
      (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0") ||
      request.headers["transfer-encoding"] !== undefined
    ) {
      return reply.code(400).send({ error: "Request not allowed" });
    }
  };
  const releaseInFlight: onResponseHookHandler = async (request) => {
    inFlightReleases.get(request)?.();
  };
  const reserveInFlight = (
    request: FastifyRequest,
    reply: FastifyReply,
    key: string
  ): FastifyReply | undefined => {
    if (inFlightKeys.has(key)) return reply.code(429).send(RATE_LIMIT_BODY);
    inFlightKeys.add(key);
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        inFlightKeys.delete(key);
        inFlightReleases.delete(request);
        request.raw.off("aborted", release);
        request.raw.off("error", release);
      }
    };
    inFlightReleases.set(request, release);
    request.raw.once("aborted", release);
    request.raw.once("error", release);
  };
  const cookieOptions = Object.freeze({
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: options.config.sessionDurationSeconds
  });
  const rejectMalformedFamilyLink = (request: FastifyRequest, reply: FastifyReply) => {
    if (options.familyLinkFailedLogins.isBlocked("family", request.ip)) {
      return reply.code(429).send(RATE_LIMIT_BODY);
    }
    options.familyLinkFailedLogins.recordFailure("family", request.ip);
    return reply.code(400).send(AUTHENTICATION_FAILURE_BODY);
  };
  const admitFamilyLink: onRequestHookHandler = async (request, reply) => {
    if (options.familyLinkFailedLogins.isBlocked("family", request.ip)) {
      return reply.code(429).send(RATE_LIMIT_BODY);
    }
    return reserveInFlight(request, reply, `family-link\0${request.ip}`);
  };
  const familyLinkCookieOptions = Object.freeze({
    httpOnly: true,
    secure: true,
    sameSite: "strict" as const,
    path: "/",
    maxAge: FAMILY_LINK_SESSION_DURATION_SECONDS
  });

  app.post("/api/auth/family-link", {
    bodyLimit: 8 * 1024,
    onRequest: [originGuard, admitFamilyLink],
    onSend: noStore,
    onResponse: releaseInFlight,
    errorHandler(error, request, reply) {
      if (MALFORMED_CREDENTIAL_ERROR_CODES.has(error.code)) {
        return rejectMalformedFamilyLink(request, reply);
      }
      throw error;
    }
  }, async (request, reply) => {
    const token = readFamilyLinkToken(request.body);
    if (token === undefined) return rejectMalformedFamilyLink(request, reply);

    const familyLink = options.familyLink;
    if (!familyLink || !verifyFamilyLinkToken(token, familyLink.tokenHash)) {
      options.familyLinkFailedLogins.recordFailure("family", request.ip);
      return reply.code(401).send(AUTHENTICATION_FAILURE_BODY);
    }

    options.familyLinkFailedLogins.recordSuccess("family", request.ip);
    return reply
      .setCookie(FAMILY_SESSION_COOKIE, familyLink.sessions.issue("family"), familyLinkCookieOptions)
      .send(SUCCESS_BODY);
  });

  for (const role of ["family", "admin"] as const) {
    const rejectMalformedCredential = (request: FastifyRequest, reply: FastifyReply) => {
      if (options.failedLogins.isBlocked(role, request.ip)) {
        return reply.code(429).send(RATE_LIMIT_BODY);
      }
      options.failedLogins.recordFailure(role, request.ip);
      return reply.code(400).send(AUTHENTICATION_FAILURE_BODY);
    };
    const admitLogin: onRequestHookHandler = async (request, reply) => {
      if (options.failedLogins.isBlocked(role, request.ip)) {
        return reply.code(429).send(RATE_LIMIT_BODY);
      }
      return reserveInFlight(request, reply, `${role}\0${request.ip}`);
    };

    app.post(`/api/auth/${role}`, {
      bodyLimit: 8 * 1024,
      onRequest: [originGuard, admitLogin],
      onSend: noStore,
      onResponse: releaseInFlight,
      errorHandler(error, request, reply) {
        if (MALFORMED_CREDENTIAL_ERROR_CODES.has(error.code)) {
          return rejectMalformedCredential(request, reply);
        }
        throw error;
      }
    }, async (request, reply) => {
      const clientIp = request.ip;
      const password = readCredential(request.body);
      if (password === undefined || Buffer.byteLength(password, "utf8") > 1024) {
        return rejectMalformedCredential(request, reply);
      }

      const releasePermit = options.passwordVerificationPermits.tryAcquire();
      if (!releasePermit) return reply.code(429).send(RATE_LIMIT_BODY);
      let authenticated = false;
      try {
        authenticated = await options.verifyPassword(password, storedHashFor(options.config, role));
      } catch {
        authenticated = false;
      } finally {
        releasePermit();
      }
      if (!authenticated) {
        options.failedLogins.recordFailure(role, clientIp);
        return reply.code(401).send(AUTHENTICATION_FAILURE_BODY);
      }

      options.failedLogins.recordSuccess(role, clientIp);
      return reply
        .setCookie(cookieNameFor(role), options.sessions.issue(role), cookieOptions)
        .send(SUCCESS_BODY);
    });

    app.get(`/api/auth/${role}/status`, {
      bodyLimit: 1,
      onRequest: rejectRequestBody,
      onSend: noStore
    }, async (request) => {
      const token = request.cookies[cookieNameFor(role)];
      return {
        authenticated: token !== undefined && (
          role === "family"
            ? verifyFamilySession(token, options.sessions, options.familyLink?.sessions)
            : options.sessions.verify(token, "admin")
        )
      };
    });

    app.post(`/api/auth/${role}/logout`, {
      bodyLimit: 1,
      onRequest: [originGuard, rejectRequestBody],
      onSend: noStore
    }, async (_request, reply) => {
      return reply.clearCookie(cookieNameFor(role), cookieOptions).send(SUCCESS_BODY);
    });
  }

  return {
    requireFamilySession: requireFamilySession(options.sessions, options.familyLink?.sessions),
    requireAdminSession: requireAdminSession(options.sessions)
  };
}
