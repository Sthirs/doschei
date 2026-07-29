FROM node:26.5.0-alpine3.23@sha256:0473b6671ff22c8eeb570c0e1e51408595d3171e73f8002c269b763f0a943149 AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/backend/package.json ./apps/backend/package.json
RUN npm ci --workspace @doschei/backend --ignore-scripts

COPY apps ./apps
RUN npm run build --workspace @doschei/backend

FROM node:26.5.0-alpine3.23@sha256:0473b6671ff22c8eeb570c0e1e51408595d3171e73f8002c269b763f0a943149
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/backend/package.json ./apps/backend/package.json
RUN npm ci --omit=dev --workspace @doschei/backend --ignore-scripts

COPY --from=build /app/apps/backend/dist ./apps/backend/dist

# Create and use non-root user
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
RUN chown -R app:app /app
USER app

WORKDIR /app/apps/backend
ENV NODE_ENV=production
CMD ["node", "dist/src/index.js"]
