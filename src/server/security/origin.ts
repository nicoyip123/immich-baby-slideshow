import type { onRequestHookHandler } from "fastify";

export const ORIGIN_REJECTION_BODY = Object.freeze({ error: "Request not allowed" });

function canonicalHttpOrigin(value: string): string | undefined {
  if (
    value.length === 0 ||
    value.trim() !== value ||
    value === "null" ||
    value.includes("\\") ||
    value.includes(",") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

export function isAllowedOrigin(
  origin: string | readonly string[] | undefined,
  publicOrigin: string
): boolean {
  if (typeof origin !== "string") return false;
  const actual = canonicalHttpOrigin(origin);
  const expected = canonicalHttpOrigin(publicOrigin);
  return actual !== undefined && expected !== undefined && actual === expected;
}

/** Reusable CSRF boundary for state-changing routes. */
export function requireConfiguredOrigin(publicOrigin: string): onRequestHookHandler {
  return async (request, reply) => {
    if (!isAllowedOrigin(request.headers.origin, publicOrigin)) {
      return reply.code(403).send(ORIGIN_REJECTION_BODY);
    }
  };
}
