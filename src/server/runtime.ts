import type { AppMode } from "./app.js";

export function resolveAppMode(nodeEnv: string | undefined): AppMode {
  return nodeEnv === "development" ? "development" : "production";
}
