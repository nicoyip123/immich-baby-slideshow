FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
RUN groupadd -g 10001 slideshow && useradd -r -u 10001 -g slideshow slideshow && mkdir -p /data /music && chown -R slideshow:slideshow /app /data /music
COPY --from=build --chown=slideshow:slideshow /app/package.json /app/package-lock.json ./
COPY --from=build --chown=slideshow:slideshow /app/node_modules ./node_modules
COPY --from=build --chown=slideshow:slideshow /app/dist ./dist
USER 10001:10001
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
