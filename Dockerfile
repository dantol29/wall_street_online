FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/game-server/package.json apps/game-server/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps apps
COPY packages packages

# Vite bakes VITE_* vars into the client bundle at build time, not runtime —
# .dockerignore excludes .env, so these must come in as build args (e.g.
# `docker build --build-arg VITE_PRIVY_APP_ID=...`). Leaving VITE_PRIVY_APP_ID
# unset is fine — it just disables the wallet-connect UI (see privyConfig.ts).
ARG VITE_PRIVY_APP_ID=""
ARG VITE_GAME_SERVER_URL=""
ENV VITE_PRIVY_APP_ID=$VITE_PRIVY_APP_ID
ENV VITE_GAME_SERVER_URL=$VITE_GAME_SERVER_URL

RUN pnpm build
RUN pnpm --filter @multiplayer/game-server deploy --prod --legacy /deployment/server

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=2567
ENV CLIENT_DIST_DIR=/app/client

WORKDIR /app/server

COPY --from=build /deployment/server ./
COPY --from=build /workspace/apps/game-server/dist ./dist
COPY --from=build /workspace/apps/client/dist /app/client

EXPOSE 2567

CMD ["node", "dist/index.js"]
