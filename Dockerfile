# syntax=docker/dockerfile:1
FROM node:24.22.0-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NUXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY nuxt.config.ts tsconfig.json prisma.config.ts ./
COPY app ./app
COPY public ./public
COPY shared ./shared
COPY server ./server
COPY prisma ./prisma
COPY scripts/run-node.mjs scripts/run-node.mjs
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:24.22.0-bookworm-slim AS pandoc
ADD --checksum=sha256:d0c90410e90204c9ca83b8539fac5c7aed01fd537207e4585849f8abc5df20b8 https://github.com/jgm/pandoc/releases/download/3.12.1/pandoc-3.12.1-linux-amd64.tar.gz /tmp/pandoc.tar.gz
RUN tar -xzf /tmp/pandoc.tar.gz -C /tmp && /tmp/pandoc-3.12.1/bin/pandoc --version

FROM node:24.22.0-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl libgmp10 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NITRO_HOST=0.0.0.0 NITRO_PORT=3000 PANDOC_PATH=/usr/local/bin/pandoc HOME=/tmp
COPY --from=pandoc /tmp/pandoc-3.12.1/bin/pandoc /usr/local/bin/pandoc
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/shared ./shared
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts ./
COPY --chown=node:node scripts/worker.ts scripts/queue-setup.ts scripts/check-storage.ts ./scripts/
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
