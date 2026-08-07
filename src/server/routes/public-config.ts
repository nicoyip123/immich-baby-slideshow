import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
export async function publicConfigRoutes(app: FastifyInstance, config: AppConfig) {
  app.get("/api/public-config", async () => ({ ga4MeasurementId: config.ga4MeasurementId, photoDurationMs: config.photoDurationMs }));
}

