FROM node:26.2.0-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/backend/package.json ./apps/backend/package.json
RUN npm install

COPY apps ./apps
RUN npm run build --workspace @doschei/backend

FROM node:26.2.0-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/frontend/package.json ./apps/frontend/package.json
COPY apps/backend/package.json ./apps/backend/package.json
RUN npm install --omit=dev --workspace @doschei/backend

COPY --from=build /app/apps/backend/dist ./apps/backend/dist

WORKDIR /app/apps/backend
ENV NODE_ENV=production
CMD ["node", "dist/src/index.js"]
