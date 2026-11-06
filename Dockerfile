# Multi-stage production Dockerfile for MeetIT Signaling Server
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

# Step 1: Copy workspace manifest files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/media/package.json ./packages/media/
COPY packages/ui/package.json ./packages/ui/
COPY apps/signaling/package.json ./apps/signaling/

# Step 2: Install dependencies
RUN pnpm install --frozen-lockfile --filter @meetit/protocol --filter @meetit/signaling

# Step 3: Copy source files and build
COPY packages/protocol ./packages/protocol
COPY apps/signaling ./apps/signaling

RUN pnpm --filter @meetit/protocol build
RUN pnpm --filter @meetit/signaling build

# Step 4: Production runner stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/protocol ./packages/protocol
COPY --from=base /app/apps/signaling/node_modules ./apps/signaling/node_modules
COPY --from=base /app/apps/signaling/dist ./apps/signaling/dist
COPY --from=base /app/apps/signaling/package.json ./apps/signaling/package.json

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8787/healthz || exit 1

CMD ["node", "apps/signaling/dist/server.js"]

