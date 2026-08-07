import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";

export type AppMode = "test" | "development" | "production";

export async function buildApp(options: { mode: AppMode }) {
  const app = Fastify({ logger: options.mode === "production" });
  await app.register(healthRoutes);
  return app;
}
