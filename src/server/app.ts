import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";

export async function buildApp(options: { mode: "test" | "production" }) {
  const app = Fastify({ logger: options.mode === "production" });
  await app.register(healthRoutes);
  return app;
}
