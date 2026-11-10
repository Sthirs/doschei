FROM node:26.13.0-alpine3.23@sha256:44a3247313f9bc069a4ec25d01b66254ed7dc4d0408727d8720dc827f0753423 AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/backend/package.json ./apps/backend/package.json
RUN npm ci --workspace @doschei/backend --ignore-scripts

COPY apps ./apps
RUN npm run build --workspace @doschei/backend

FROM node:26.13.0-alpine3.23@sha256:44a3247313f9bc069a4ec25d01b66254ed7dc4d0408727d8720dc827f0753423
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
