FROM node:26.9.0-alpine3.23@sha256:9dac39bfd053b458593c44a099d2667994c8fa9e1a8c10bc7ff2f3d97b62412d AS build
WORKDIR /app

ARG APP_VERSION=dev
ENV VITE_APP_VERSION=$APP_VERSION

COPY package.json package-lock.json* ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json
RUN npm ci --workspace @doschei/frontend --ignore-scripts

COPY apps ./apps
RUN npm run build --workspace @doschei/frontend

FROM nginxinc/nginx-unprivileged:1.31.2-alpine3.23@sha256:6320020c7da8714feab524e02c08c5a1958675c4e68700e93a2fd8970b065786
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
