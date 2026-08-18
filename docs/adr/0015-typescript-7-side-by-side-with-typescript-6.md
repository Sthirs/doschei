# ADR-0015: TypeScript 7 side-by-side with TypeScript 6 via npm aliases

- **Status:** 🟢 accepted
- **Date:** 2026-08-18
- **Deciders:** Maintainers

## Context

Renovate bumped `typescript` to `7.0.2`. Two tools in the dependency tree cannot yet run on
TypeScript 7:

- `typescript-eslint@8.67.0` declares the peer `typescript >=4.8.4 <6.1.0`. TS 7.0.2 violates the
  upper cap, so `npm ci` fails with `ERESOLVE`.
- `vue-tsc@3.3.9` (peer `typescript >=5.0.0`) imports the classic `typescript` JS API. TS 7 ships
  no classic JS API; it crashes at startup with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The frontend
  type-check therefore has to stay on TS 6.

The backend `tsc` build, however, wants the TS 7 speedup (TS 7 is a native port that is roughly an
order of magnitude faster than TS 6 for the same compilation). We need both: TS 7 for the backend
build, TS 6 for anything that `import 'typescript'`s by name.

This is the exact scenario the TypeScript team documented in the TS 7.0 announcement under
"Running Side-by-Side with TypeScript 6.0": ship TS 7 under an npm alias that exposes the `tsc`
binary, and keep TS 6 available under the canonical `typescript` name for tools that still need the
classic API.

## Decision

We will run TypeScript 7 (via a `@typescript/native` npm alias to `typescript@^7.0.2`, which
provides the `tsc` binary) side-by-side with TypeScript 6 (via npm-aliasing `typescript` to
`@typescript/typescript6@~6.0.2` in both workspaces), so that tools that `import 'typescript'` by
name — typescript-eslint and vue-tsc — resolve the TS 6 API, while the backend's `tsc` build
resolves TS 7. We pin the TS 6 alias with a tilde (`~6.0.2`), NOT the caret (`^6.0.2`) shown in the
Microsoft blog, because `^6.0.2` would allow `@typescript/typescript6` 6.1.0+ and re-violate the
`<6.1.0` peer cap that typescript-eslint enforces.

## Alternatives considered

- **Alternative A: `npm ci --legacy-peer-deps` / `--force`** — rejected. It masks the peer
  conflict, can produce a silently broken install, and the flag would have to leak into CI and
  Docker build args.
- **Alternative B: downgrade `typescript` to 5.x** — rejected. It loses the TS 7 speedup Renovate
  intended, and TS 5.x is aging out of upstream support.
- **Alternative C: downgrade `typescript-eslint` to a version with a wider peer range** — rejected.
  No such version exists; the 8.x line caps at `<6.1.0`.
- **Alternative D: wait for typescript-eslint and vue-tsc to support the TS 7 programmatic API** —
  rejected. It blocks the Renovate upgrade today, and the TS 7 API is not expected from upstream
  until around TS 7.1.

## Sources / Prior art

- TypeScript 7.0 announcement, "Running Side-by-Side with TypeScript 6.0" section:
  <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/>
- TypeScript 6.0 announcement:
  <https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/>
- typescript-eslint issue #10940 (TS 7 peer-range incompatibility):
  <https://github.com/typescript-eslint/typescript-eslint/issues/10940>
- npm registry metadata for `@typescript/typescript6@6.0.2`, `typescript-eslint@8.67.0`, and
  `vue-tsc@3.3.9` (peer ranges and published wrapper behaviour).
- [`AGENTS.md`](../../AGENTS.md) §3 — ADR rules (binding process, status ownership, source-citing).

## Consequences

- Positive: `npm ci` is unblocked without `--legacy-peer-deps` or `--force`.
- Positive: the backend keeps the TS 7 `tsc` speedup; the frontend type-check keeps working on the
  TS 6 classic API that vue-tsc and typescript-eslint require.
- Positive: typescript-eslint and vue-tsc keep working unchanged, with no fork or patch required.
- Negative / trade-offs: two TypeScript versions now coexist in the dependency tree. `node_modules`
  is larger, and contributors have two binaries to reason about (`tsc` for TS 7, `tsc6` for TS 6).
- Negative / trade-offs: the alias wiring is load-bearing. Contributors MUST NOT "fix" the alias
  back to `typescript: ^7` in either workspace — doing so re-breaks `npm ci` and the frontend
  type-check in the exact way this ADR avoids.
- Negative / trade-offs: `npx tsc6 --version` reports `6.0.3`, not `6.0.2`. This is the real
  observed behaviour: the `@typescript/typescript6@6.0.2` wrapper re-exports its inner
  `typescript@^6`, which resolves to the latest 6.0.x. That is still `<6.1.0`, so the
  typescript-eslint peer cap holds, but the version string is worth knowing so nobody treats it as
  a regression.
- Follow-ups: when both typescript-eslint and vue-tsc support the TS 7 programmatic API (expected
  around TS 7.1), a follow-up ADR will remove the alias and unify the workspaces on
  `typescript: ^7`, superseding this one.
