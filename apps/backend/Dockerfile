FROM node:26.3.0-alpine3.23@sha256:144769ec3f32e8ee36b3cfde91e82bee25d9367b20f31a151f3f7eea3a2a8541 AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/backend/package.json ./apps/backend/package.json
RUN npm ci --workspace @doschei/backend --ignore-scripts

COPY apps ./apps
RUN npm run build --workspace @doschei/backend

FROM node:26.3.0-alpine3.23@sha256:144769ec3f32e8ee36b3cfde91e82bee25d9367b20f31a151f3f7eea3a2a8541
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
