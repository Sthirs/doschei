FROM node:26.3.0-alpine3.23@sha256:144769ec3f32e8ee36b3cfde91e82bee25d9367b20f31a151f3f7eea3a2a8541 AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN npm ci

COPY apps ./apps
RUN npm run build --workspace @doschei/frontend

FROM nginxinc/nginx-unprivileged:1.31.1-alpine3.23@sha256:df7e2a2fb80b719d37c221f4fc1f40192b788fcbfc30e40160add48795a13380
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
