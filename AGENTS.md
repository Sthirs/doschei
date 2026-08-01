# Do Schèi — contribution methodology

> **Binding for every contributor — human and coding agent.** This file is the
> single authority on how work is done in this repository. When it contradicts a
> habit or a default, this file wins.

## 1. Start Here

Before any change, read:

- **[`docs/specifications.md`](docs/specifications.md)** — the canonical product
  specification: features, product decisions, balance rules, and architecture.
- **[`README.md`](README.md)** — the supported development workflow (Telepresence,
  Minikube, Helm), prerequisites, daily commands, and repo structure.

**Hierarchy of truth:** Specification > ADRs > code. When the spec, an ADR, and
the code disagree, fix the higher layer — never silently diverge the code from
what the spec or an accepted ADR says.

## 2. Making changes

Follow the right process for the kind of change:

| Change type | Process |
| --- | --- |
| Product behaviour, features, or invariants | Edit [`docs/specifications.md`](docs/specifications.md). Requires human review. |
| Architectural, cross-cutting, or irreversible technical decision | Write an ADR (see [§3](#3-adr-rules)). Do not encode an irreversible decision in code alone. |
| Implementation of the spec or an ADR | Follow the spec and all accepted ADRs in the relevant domain. Use the commit trailer `Implements ADR-NNNN` when a change realises an accepted ADR. |

## 3. ADR Rules

Architecture Decision Records live in [`docs/adr/`](docs/adr/). Full process and
index: [`docs/adr/README.md`](docs/adr/README.md). Template:
[`docs/adr/template.md`](docs/adr/template.md).

These rules are **binding**:

1. **Accepted ADRs are binding** — for humans and coding agents alike.
2. **Never edit an accepted ADR** — supersede it with a new ADR
   (status `superseded by ADR-NNNN`).
3. **Never reference an ADR number that does not exist yet.** Write the topic in
   the Consequences section; cite the number only after the file exists.
4. **Only humans change ADR status** (`proposed` → `accepted` / `rejected` /
   `superseded`).
5. **ADR numbers are permanent.** Never renumber, delete, or merge ADRs.
   Supersede, do not consolidate. Superseded ADRs stay as historical record.
6. **Cite your sources.** Every ADR must capture what informed the decision
   (spec section, prior ADR, external reference) — per the template's Sources section.

## 4. Project Rules

### 4.1 ADR compliance

- Every implementation **must** follow all accepted ADRs that apply to its domain.
- Cite `Implements ADR-NNNN` in the commit message when a change realises an
  accepted ADR.

### 4.2 Testing

- Every user-facing **feature** must have automated tests, including **at least
  one Playwright end-to-end test** covering its happy path.
  - Playwright config: [`playwright.config.ts`](playwright.config.ts).
  - Run e2e tests: `scripts/test-playwright.sh`.
- Unit tests (Vitest) for business logic. Integration tests (Supertest) for
  backend endpoints. E2E (Playwright) for user-facing flows.
- Pure refactors or bugfixes need tests where behaviour changes; trivial /
  mechanical refactors may skip new test coverage at reviewer discretion.

## For coding agents

Quick rules to follow on every change:

- **Do not edit accepted ADRs.** Do not fabricate ADR numbers. Do not change
  ADR status.
- **Verify before declaring work done:**
  1. `npm run lint` — must pass.
  2. `npm run test` — unit + integration tests must pass.
  3. `scripts/test-playwright.sh` — for any user-facing change.
- **Cite `Implements ADR-NNNN`** in the commit message when realising an
  accepted ADR.
- **The spec and accepted ADRs outrank any heuristics or defaults** you might
  otherwise apply. When in doubt, read [`docs/specifications.md`](docs/specifications.md)
  and [`docs/adr/`](docs/adr/).
