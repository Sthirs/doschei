# ADR-0029: HTTP response compression — nginx gzip for static files, Express `compression` (Brotli/gzip) for the API

- **Status:** 🟢 accepted
- **Date:** 2026-10-31
- **Deciders:** Sthirs

## Context

No response is compressed today. The frontend image
([ADR-0002](0002-frontend-stack.md), `apps/frontend/nginx.conf`) runs
`nginx-unprivileged` with gzip off by default, so the JS/CSS bundles and HTML
shell go out raw. The Express backend ([ADR-0003](0003-backend-stack.md),
`apps/backend/src/app.ts`) has no compression middleware, so every JSON
response is sent uncompressed, including the large group detail payloads that
carry DB-resident image data URLs ([ADR-0019](0019-image-upload-architecture.md))
and the streamed CSV export ([ADR-0011](0011-group-expenses-csv-export.md)).

The chart's Ingress ([ADR-0007](0007-kubernetes-helm-deployment.md)) routes
`/api` straight to the backend and `/` to the frontend. ingress-nginx can gzip
(`use-gzip`), but only from the controller-wide ConfigMap, not per Ingress, so
the chart cannot turn it on, and other controllers do it differently or not at
all.

The app is a mobile-first PWA, so payload size on cellular links matters.

## Decision

We will compress at each workload, independent of the ingress controller:

- **Static files:** the frontend nginx enables on-the-fly gzip at server
  level (`gzip on`, `gzip_comp_level 5`, `gzip_min_length 1024`,
  `gzip_vary on`, `gzip_proxied any`) for CSS, JavaScript, JSON, SVG and
  plain text. HTML is always included. Raster images (WebP/PNG) are excluded
  because they are already compressed. The web app manifest is left out: it
  is under the 1 KB threshold.
- **API:** the backend mounts the `compression` middleware (exact-pinned)
  in `createApp()` before every route and error handler, with the library
  defaults: Brotli preferred, then gzip/deflate, negotiated via
  `Accept-Encoding`; Brotli at quality 4; 1 KB threshold; `compressible` MIME
  filter. The streamed CSV export keeps working: the middleware wraps
  `write`/`end` and the download itself gets compressed.

## Alternatives considered

- **ingress-nginx `use-gzip`** — not chosen: it's a controller-wide ConfigMap
  setting outside the chart, so it's not portable across controllers or
  clusters the chart doesn't own.
- **Build-time precompression** (`vite-plugin-compression` + `gzip_static`) —
  not chosen for now: it adds a build dependency and an nginx module
  assumption for a small CPU saving. Hashed assets are already
  `immutable`-cached ([ADR-0020](0020-client-cache-lifecycle-on-deploy.md)),
  so each one is compressed rarely per client.
- **Brotli for static files** — not chosen: the official `nginx-unprivileged`
  alpine image does not ship `ngx_brotli`, and gzip is universally supported.
  This does not apply to the API: Node's `zlib` has Brotli built in, so the
  backend uses it.
- **Compress API JSON only at the frontend nginx `/api/` proxy** — not chosen:
  the Ingress sends `/api` directly to the backend, bypassing that proxy.

## Sources / Prior art

- nginx `ngx_http_gzip_module` documentation —
  <https://nginx.org/en/docs/http/ngx_http_gzip_module.html>
- expressjs/compression README — <https://github.com/expressjs/compression>
- ingress-nginx ConfigMap `use-gzip` —
  <https://kubernetes.github.io/ingress-nginx/user-guide/nginx-configuration/configmap/#use-gzip>
- Spec: [`docs/specifications.md`](../specifications.md) architecture section.

## Consequences

- Positive: text transfers shrink, typically by 60–80%. No dependency on the
  ingress controller. `Vary: Accept-Encoding` keeps shared caches correct.
  Brotli usually makes API JSON another 15–20% smaller than gzip.
- Negative / trade-offs: a small per-request CPU cost in nginx and Node. One
  new runtime dependency in the backend. The streamed CSV export is buffered
  by the compressor, so it reaches the client in large chunks or all at the
  end; acceptable at its size (one group, one month).
- Follow-ups: a possible follow-up ADR on Brotli for static files
  (build-time precompression or an nginx image with `ngx_brotli`) if CPU or
  bandwidth measurements justify it.
