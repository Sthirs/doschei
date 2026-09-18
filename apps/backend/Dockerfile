FROM node:26.9.0-alpine3.23@sha256:9dac39bfd053b458593c44a099d2667994c8fa9e1a8c10bc7ff2f3d97b62412d AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/backend/package.json ./apps/backend/package.json
RUN npm ci --workspace @doschei/backend --ignore-scripts

COPY apps ./apps
RUN npm run build --workspace @doschei/backend

FROM node:26.9.0-alpine3.23@sha256:9dac39bfd053b458593c44a099d2667994c8fa9e1a8c10bc7ff2f3d97b62412d
WORKDIR /app

COPY --chown=1001:1001 package.json package-lock.json* ./
COPY --chown=1001:1001 apps/frontend/package.json ./apps/frontend/package.json
COPY --chown=1001:1001 apps/backend/package.json ./apps/backend/package.json
RUN npm ci --omit=dev --workspace @doschei/backend --ignore-scripts

COPY --from=build --chown=1001:1001 /app/apps/backend/dist ./apps/backend/dist

# Create and use non-root user
RUN addgroup -g 1001 -S app && adduser -S app -u 1001
USER app

WORKDIR /app/apps/backend
ENV NODE_ENV=production
CMD ["node", "dist/src/index.js"]
