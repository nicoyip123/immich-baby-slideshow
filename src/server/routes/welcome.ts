import type { FastifyInstance, preHandlerHookHandler } from "fastify";

const welcomeCopy = Object.freeze({
  eyebrow: "Seren’s little story",
  title: "From your very first days…",
  body: "A collection of tiny moments, growing smiles, and all the love that has surrounded you since the day you arrived.",
  translations: {
    "zh-Hans": {
      eyebrow: "Seren 的成长故事",
      title: "从你来到世界的那一天起…",
      body: "珍藏每个小小的瞬间、日渐灿烂的笑容，还有从你出生起就一直围绕着你的爱。"
    },
    "zh-Hant": {
      eyebrow: "Seren 的成長故事",
      title: "從你來到世界的那一天起…",
      body: "珍藏每個小小的瞬間、日漸燦爛的笑容，還有從你出生起就一直圍繞著你的愛。"
    }
  }
});

export async function welcomeRoutes(app: FastifyInstance, options: { family: preHandlerHookHandler }) {
  app.get("/api/welcome", { preHandler: options.family }, async (_request, reply) => reply.header("cache-control", "private, no-store").send(welcomeCopy));
}
