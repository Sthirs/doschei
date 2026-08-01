# ADR-0002: Frontend stack — Vue 3, TypeScript, Vite, Pinia, Tailwind, PWA

- **Status:** 🟢 accepted
- **Date:** 2026-07-31
- **Deciders:** Sthirs

## Context

The specification (`docs/specifications.md` §Frontend) requires a responsive, accessible, installable PWA built with Vue.js 3 and TypeScript, using the Composition API and `script setup` syntax, with Pinia for state, Vue Router for routing, Axios for HTTP, Tailwind CSS for styling, Vite as the build tool, and PWA support for installation and offline use. The bootstrap PR #1 delivered the core stack; PR #18 (`feat: select user that paid for the expense`) solidified the PWA configuration with `vite-plugin-pwa`.

## Decision

We will build the frontend with Vue 3.5 + TypeScript using Composition API and `script setup`, Vite 8 as the build tool, Pinia 3 for state management, Vue Router 5 for routing, Axios for HTTP, Tailwind CSS 4 (via `@tailwindcss/postcss`) for utility-first styling, and `vite-plugin-pwa` for PWA features. Unit tests use Vitest with `@vue/test-utils` and `happy-dom`. The frontend has a dedicated Dockerfile that builds it as an nginx-served microservice deployable in Kubernetes.

## Alternatives considered

- **React** — the dominant SPA framework. Not chosen: Vue 3's Composition API with `script setup` offers comparable ergonomics with a smaller bundle and the team's familiarity.
- **Nuxt 3** — Vue meta-framework with SSR. Not chosen: the app is a client-side PWA; SSR adds server complexity without clear benefit for an expense tracker behind auth.
- **Svelte / SvelteKit** — Not chosen: Vue's ecosystem (Pinia, Vue Router, Vue Test Utils) is more mature for the team's needs.
- **CSS Modules / styled-components** — Not chosen: Tailwind's utility-first approach speeds up responsive layout work and keeps styles co-located without runtime cost.

## Sources / Prior art

- `docs/specifications.md` §Frontend — specifies Vue 3 + TypeScript, Composition API, `script setup`, Pinia, Vue Router, Axios, Tailwind, PWA, Vite, ESLint + Prettier.
- PR #1 (`1571040`) — delivered the core frontend stack.
- PR #18 (`db75c34` — `feat: select user that paid for the expense`) — solidified PWA with `vite-plugin-pwa` and Vite HMR config for the ingress host.
- `apps/frontend/package.json` — Vue 3.5.38, Pinia 3.0.4, Vue Router 5.1.0, Axios, Tailwind 4.3.1, Vite 8.1.0, `vite-plugin-pwa` 1.3.0.

## Consequences

- Positive: Composition API + `script setup` gives terse, type-safe components; Vite 8 provides fast HMR in development and optimized production builds; Tailwind 4 keeps styling consistent and responsive.
- Positive: PWA support means users can install the app on mobile and desktop; Vite HMR is configured to work behind the Telepresence ingress host (see ADR on dev workflow).
- Negative / trade-offs: no internationalization framework yet — the spec requires EN/IT but `vue-i18n` is not a dependency; all UI strings are currently hard-coded in English.
- Negative / trade-offs: Cypress 15 remains as a vestigial devDependency with a `test:e2e` script, even though Playwright was adopted for e2e (see testing strategy).
- Follow-ups: Internationalization (EN/IT): choose and integrate a Vue i18n solution — the spec requires it but no framework has been selected yet.
- Follow-ups: Remove the vestigial Cypress dependency and `cypress.config.ts` once all e2e is confirmed on Playwright.
