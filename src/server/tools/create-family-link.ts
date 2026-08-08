import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createFamilyLink, type FamilyLink } from "../security/family-link.js";

export function normalizeFamilyLinkPublicOrigin(value: string): string {
  if (value.includes("?") || value.includes("#")) throw new Error("PUBLIC_ORIGIN must be an HTTPS origin only");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PUBLIC_ORIGIN must be an HTTPS origin only");
  }

  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("PUBLIC_ORIGIN must be an HTTPS origin only");
  }
  if (value !== url.origin && value !== `${url.origin}/`) {
    throw new Error("PUBLIC_ORIGIN must be an HTTPS origin only");
  }
  return url.origin;
}

export function formatFamilyLink(link: Pick<FamilyLink, "tokenHash" | "url">): string {
  return `FAMILY_LINK_TOKEN_HASH='${link.tokenHash}'\nFAMILY_LINK_URL='${link.url}'\n`;
}

export function runCreateFamilyLink(publicOrigin: string = process.env.PUBLIC_ORIGIN ?? ""): string {
  const normalizedOrigin = normalizeFamilyLinkPublicOrigin(publicOrigin);
  return formatFamilyLink(createFamilyLink(normalizedOrigin));
}

function isDirectExecution(): boolean {
  const invokedScript = process.argv[1];
  if (!invokedScript) return false;

  try {
    return realpathSync(invokedScript) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  try {
    if (process.argv.length > 2) throw new Error("This tool does not accept command-line arguments");
    process.stdout.write(runCreateFamilyLink());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create family link";
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  }
}
