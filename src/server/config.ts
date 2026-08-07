import { isIP } from "node:net";
import { z } from "zod";
import { isStoredPasswordHash } from "./security/password.js";

export interface AppConfig {
  immichUrl: string;
  immichApiKey: string;
  familyPasswordHash: string;
  adminPasswordHash: string;
  babyBirthDate: string;
  timezone: string;
  sessionSecret: string;
  publicOrigin: string;
  trustedProxyCidrs: string[];
  databasePath: string;
  soundtrackPath: string;
  ga4MeasurementId?: string;
  photoDurationMs: number;
  sessionDurationSeconds: number;
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export const envSchema = z.object({
  IMMICH_URL: z.string().url(),
  IMMICH_API_KEY: z.string().min(20),
  FAMILY_PASSWORD_HASH: z.string().refine(isStoredPasswordHash, "must be a canonical scrypt stored hash"),
  ADMIN_PASSWORD_HASH: z.string().refine(isStoredPasswordHash, "must be a canonical scrypt stored hash"),
  BABY_BIRTH_DATE: z.string().regex(isoDatePattern, "must use YYYY-MM-DD"),
  TZ: z.string().default("Australia/Melbourne"),
  SESSION_SECRET: z.string().min(32),
  PUBLIC_ORIGIN: z.string().url(),
  TRUSTED_PROXY_CIDRS: z.string().max(4096).default(""),
  DATABASE_PATH: z.string().default("/data/stats.sqlite"),
  SOUNDTRACK_PATH: z.string().default("/music/soundtrack.mp3"),
  GA4_MEASUREMENT_ID: z.string().regex(/^G-[A-Z0-9]+$/).optional(),
  PHOTO_DURATION_MS: z.coerce.number().int().min(3000).max(30000).default(7000),
  SESSION_DURATION_SECONDS: z.coerce.number().int().min(300).max(2_592_000).default(604800)
});

function isCalendarDate(value: string): boolean {
  if (!isoDatePattern.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const daysInMonth = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]!;
}

function isPrivateIpv4(hostname: string): boolean {
  const segments = hostname.split(".");
  if (segments.length !== 4 || segments.some((segment) => !/^\d+$/.test(segment))) return false;

  const octets = segments.map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  return (
    octets[0] === 127 ||
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function isPrivateImmichHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  const ipv6 = host.replace(/^\[|\]$/g, "");
  if (ipv6 === "::1" || ipv6.startsWith("fc") || ipv6.startsWith("fd")) return true;
  if (isPrivateIpv4(host)) return true;
  if (host.endsWith(".internal") && host.length > ".internal".length) return true;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(host);
}

function parseHttpOrigin(value: string, field: "IMMICH_URL" | "PUBLIC_ORIGIN"): URL {
  if (value.includes("?") || value.includes("#")) {
    throw new Error(field === "IMMICH_URL" ? "IMMICH_URL must be a private Immich URL" : "PUBLIC_ORIGIN must be an origin only");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(field === "IMMICH_URL" ? "IMMICH_URL must be a private Immich URL" : "PUBLIC_ORIGIN must be an origin only");
  }
  return url;
}

function formatSchemaError(error: z.ZodError): Error {
  return new Error(error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
}

function parseTrustedProxyCidrs(value: string): string[] {
  if (value.trim() === "") return [];
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.length > 64 || entries.some((entry) => entry.length === 0)) {
    throw new Error("TRUSTED_PROXY_CIDRS must contain 1 to 64 literal IP or CIDR entries");
  }

  for (const entry of entries) {
    const slash = entry.indexOf("/");
    const address = slash === -1 ? entry : entry.slice(0, slash);
    const family = isIP(address);
    if (family === 0) throw new Error("TRUSTED_PROXY_CIDRS must contain only literal IP or CIDR entries");
    if (slash !== -1) {
      const prefix = entry.slice(slash + 1);
      const maxPrefix = family === 4 ? 32 : 128;
      if (entry.indexOf("/", slash + 1) !== -1 || !/^\d+$/.test(prefix)) {
        throw new Error("TRUSTED_PROXY_CIDRS contains a malformed CIDR");
      }
      const prefixLength = Number(prefix);
      if (prefixLength < 1 || prefixLength > maxPrefix) {
        throw new Error("TRUSTED_PROXY_CIDRS must not trust a blanket or malformed CIDR");
      }
    }
  }
  return entries;
}

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw formatSchemaError(parsed.error);

  if (!isCalendarDate(parsed.data.BABY_BIRTH_DATE)) {
    throw new Error("BABY_BIRTH_DATE must be a valid calendar date in YYYY-MM-DD format");
  }

  const immichUrl = parseHttpOrigin(parsed.data.IMMICH_URL, "IMMICH_URL");
  if (!isPrivateImmichHost(immichUrl.hostname)) {
    throw new Error("IMMICH_URL must be a private Immich URL");
  }
  const publicOrigin = parseHttpOrigin(parsed.data.PUBLIC_ORIGIN, "PUBLIC_ORIGIN");

  return {
    immichUrl: immichUrl.origin,
    immichApiKey: parsed.data.IMMICH_API_KEY,
    familyPasswordHash: parsed.data.FAMILY_PASSWORD_HASH,
    adminPasswordHash: parsed.data.ADMIN_PASSWORD_HASH,
    babyBirthDate: parsed.data.BABY_BIRTH_DATE,
    timezone: parsed.data.TZ,
    sessionSecret: parsed.data.SESSION_SECRET,
    publicOrigin: publicOrigin.origin,
    trustedProxyCidrs: parseTrustedProxyCidrs(parsed.data.TRUSTED_PROXY_CIDRS),
    databasePath: parsed.data.DATABASE_PATH,
    soundtrackPath: parsed.data.SOUNDTRACK_PATH,
    ga4MeasurementId: parsed.data.GA4_MEASUREMENT_ID,
    photoDurationMs: parsed.data.PHOTO_DURATION_MS,
    sessionDurationSeconds: parsed.data.SESSION_DURATION_SECONDS
  };
}
