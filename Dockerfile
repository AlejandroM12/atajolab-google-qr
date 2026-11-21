# AtajoLab QR: imagen de producción (Hetzner). Se construye con `deploy/hetzner/ship.sh`.
# No incluye secretos: las variables llegan por `env_file` en tiempo de ejecución.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 CI=true
# openssl antes de `prisma generate`: sin él Prisma elige el motor para openssl 1.1 y no arranca.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec prisma generate && pnpm build

FROM node:22-bookworm-slim
# openssl: el motor de Prisma lo necesita. wget no hace falta: el healthcheck usa node.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/next.config.ts /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/assets ./assets
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/lib ./lib
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start"]
