FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV CI=true

FROM base AS deps
COPY api/package.json api/package-lock.json ./
RUN npm ci

FROM deps AS build
COPY api/ ./
RUN npm run build

FROM base AS prod-deps
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node api/package.json api/package-lock.json ./

USER node
EXPOSE 3000

CMD ["node", "dist/main.js"]
