import { buildApp } from "./app.js";
import { resolveAppMode } from "./runtime.js";

const app = await buildApp({ mode: resolveAppMode(process.env.NODE_ENV) });
await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
