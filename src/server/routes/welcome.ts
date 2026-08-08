import type { FastifyInstance, preHandlerHookHandler } from "fastify";

const welcomeCopy = Object.freeze({
  eyebrow: "Seren’s little story",
  title: "From your very first days…",
  body: "A collection of tiny moments, growing smiles, and all the love that has surrounded you since the day you arrived."
});

export async function welcomeRoutes(app: FastifyInstance, options: { family: preHandlerHookHandler }) {
  app.get("/api/welcome", { preHandler: options.family }, async (_request, reply) => reply.header("cache-control", "private, no-store").send(welcomeCopy));
}
