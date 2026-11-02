# Stage 1: install dependencies (including dev dependencies, needed to build)
FROM node:24.21.0-alpine AS deps
WORKDIR /app
# Install as node, not root: the dev and migrate stages run as node, and tools
# write caches inside node_modules (Vitest uses node_modules/.vitest-cache, #64)
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

# Dev stage (make dev): no build, the source code is bind-mounted at runtime
# and `next dev` reloads on every change. Not used by the default build.
FROM deps AS dev
ENV NEXT_TELEMETRY_DISABLED=1
USER node
EXPOSE 3000
# Generate the Prisma client at start: ./web is bind-mounted over /app,
# so anything generated at build time would be hidden by the mount.
# Then load the demo data (prisma/seed.ts). A failing seed does not stop the
# app (it is only test data), but it prints SEED FAILED in the logs.
CMD ["sh", "-c", "npx prisma generate && { npx prisma db seed || echo 'SEED FAILED: see the error above. The app starts without demo data.'; } && npm run dev -- --hostname 0.0.0.0"]

# Migrate stage (migrate service, used by both make and make dev): applies the
# pending migrations to the database and exits. Keeps the Prisma CLI out of
# the final image.
FROM deps AS migrate
COPY prisma.config.ts ./
COPY prisma ./prisma
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# Stage 2: build the app (generates .next/standalone)
FROM node:24.21.0-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The app imports the generated Prisma client, so it must exist before compiling
RUN npx prisma generate
RUN npm run build

# Stage 3: final image, only what is needed to run
FROM node:24.21.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
