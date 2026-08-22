# Do Schèi

Do Schèi is a web application that allows users to track shared expenses and split them with other users.

## Features

- The application is multilingual and supports English and Italian.
- Users can create an account and sign in to the application.
- Users can sign in with any OIDC provider (for example Google).
- Users can create groups and invite other users to join via email. A group member can invite any user by email (whether or not that user has registered yet). The invitation is keyed by the email address and is visible to the invitee as a pending invitation card in their groups list. The invitee's display name and id are NOT shared with the inviter or the group until the invitee accepts. The invitee can accept or decline. On accept the invitee becomes a member and their display name appears in the group. The inviter can cancel an unaccepted invitation. The pending-invitations section of the groups list is hidden entirely when the user has no pending invitations.
- A group can have multiple users, and each user can belong to multiple groups.
- A group has a name and an image that can be updated by its members.
- A group contains a list of expenses shared among its members.
- Each expense includes a description, an amount, a date, a category, a payer, and split details.
- Expense categories are predefined, and users can choose one when creating an expense.
- Expense categories are:
  - Entertainment
    - Games
    - Movies
    - Music
    - Other
    - Sports
  - Food and Drink
    - Dining Out
    - Groceries
    - Liquor
    - Other
  - Home
    - Electronics
    - Furniture
    - Household Supplies
    - Maintenance
    - Mortgage
    - Other
    - Pets
    - Rent
    - Services
  - Life
    - Childcare
    - Clothing
    - Education
    - Gifts
    - Insurance
    - Medical Expenses
    - Other
    - Taxes
  - Transportation
    - Bicycle
    - Bus/Train
    - Car
    - Gas/Fuel
    - Hotel
    - Other
    - Parking
    - Plane
    - Taxi
  - Uncategorized
    - General
  - Utilities
    - Cleaning
    - Electricity
    - Heat/Gas
    - Other
    - Trash
    - TV/Phone/Internet
    - Water
- Users can add an expense and choose who paid for it and how it is split among the users in the group.
- Expenses can be split in one of the following ways:
  - Equal split: the expense is divided equally among all users in the group, or among a selected subset of users.
  - Exact split: the expense is divided according to the exact amount specified for each user in the group.
  - Percentage split: the expense is divided according to the percentage specified for each user in the group.
- In groups with exactly two users, the following shortcuts are available for faster data entry, while the other options are shown behind a **More options** action:
  - You paid, split equally.
  - You are owed the full amount.
  - The other user paid, split equally.
  - The other user is owed the full amount.
- Each group shows how much each user owes or is owed within the group.
- Users can record a settle-up payment between two users in a group. This creates a settlement expense that records the payment amount, the payer, and the payee.
- Users can edit and delete an expense.
- Every user in a group can view the group's expenses and balances, and can edit any expense regardless of who created it.
- Activities are tracked.
- Group expenses can be exported as a CSV file.
- Users can view and edit their account profile. Users can change their display name; the name is editable even when it was originally provided by an OAuth provider. The user's email address cannot be changed. The profile picture is shown as the first letter of the display name (initials avatar); uploading or changing a profile picture is not supported.

## Product Decisions

- The first release targets a single currency per workspace, with EUR as the default currency.
- Monetary values must be stored and processed as integer cents to avoid floating-point rounding issues.
- Expense dates are stored as calendar dates and represent the date selected by the user, without time-of-day semantics.
- The user interface supports English and Italian. The application should use the user's saved language preference when available, and fall back to English otherwise.
- Categories must be represented internally by stable keys, while labels are localized in the frontend.
- All group members share the same permissions for creating, editing, deleting, and exporting expenses, as well as for recording settle-up payments.
- Editing an expense allows changing any of its fields, including its description, amount, date, category, payer, and split details.
- A settle-up payment is represented as a special expense entry so that it appears in the same ledger and affects balances consistently.
- CSV export must include both regular expenses and settle-up entries that are currently visible in the group ledger.
- Deleting an expense removes it from active balances immediately; any activity entry generated for the deletion remains part of the activity history.
- The canonical financial source of truth is the ledger of expenses and settlement entries; balances are always derived from that ledger.
- The display name is the single editable profile field; the email address is immutable after account creation and is never accepted by the profile-update API.

## Balance Rules

- Every expense has a total amount, one payer, and one or more participants who are responsible for the amount according to the selected split mode.
- A payer may or may not be one of the participants in the split. The expense definition, not the payer role alone, determines who owes what.
- For each expense, the net balance change for a user is:
  - **amount paid by the user**
  - minus **amount owed by the user for that expense**
- A positive balance means the user is owed money by the group.
- A negative balance means the user owes money to the group.
- The sum of all member balances in a group must always be exactly zero.
- Equal splits must allocate the full amount in cents. When the amount cannot be divided evenly, the remaining cents are distributed one by one using the participant order stored on the expense, so the result is deterministic.
- Exact splits must sum to the full expense amount in cents; otherwise, the expense is invalid.
- Percentage splits must total 100%. When converting percentages to cents, the final allocated amounts must sum exactly to the expense amount, using a deterministic remainder distribution strategy.
- Group balances are always recalculated from the current set of non-deleted ledger entries after an expense is created, edited, deleted, or after a settle-up payment is recorded.
- A settle-up payment reduces the debt of the payer and reduces the credit of the payee by the same amount.
- The per-member net balance is the canonical balance representation. Any pairwise breakdown shown in the UI is a derived view and must remain consistent with the canonical member balances.

## Architecture

- It is a web application that can be installed as a PWA on mobile and desktop.
- It is primarily designed for mobile devices, but it also works well on desktop devices.
- It is composed of a frontend, a backend, and a database.
- The frontend and the backend communicate through a REST API.
- It supports local authentication and authentication via OAuth2.
- It is cloud native and can be deployed to a Kubernetes cluster through a Helm chart.

### Frontend

The frontend is built with Vue.js 3 and TypeScript.
Vue components are written using the Composition API and the `script setup` syntax.
Styling is primarily implemented with Tailwind CSS, and any component-specific styles are scoped to avoid conflicts.
It uses Pinia for state management and Vue Router for routing.
It uses Axios for HTTP communication with the backend.
It is designed to be responsive and to work well on both mobile and desktop devices.
It is designed to be accessible and to follow WCAG guidelines.
It is designed to be performant and uses lazy loading and code splitting to reduce the initial load time.
It uses PWA features to allow users to install the application on their devices and use it offline.
It uses Vite as the build tool to provide a fast development experience and an optimized production build.
It uses ESLint and Prettier to maintain a consistent code style and catch potential issues early in the development process.
It uses Vitest and Vue Test Utils for unit testing, and Playwright for end-to-end testing to ensure the quality of the code and the functionality of the application.
It has a dedicated Dockerfile to build the frontend as a microservice that can be deployed in a Kubernetes cluster.

### Backend

The backend is built with Node.js and TypeScript.
It exposes a REST API that the frontend can consume to perform CRUD operations on the data.
It handles user authentication and authorization.
It implements the Authorization Code + PKCE flow for OAuth2 authentication and also supports local authentication using email and password.
It uses Express.js as the web framework and TypeORM as the ORM to interact with the database.
It is designed to be scalable and to handle a large number of requests.
It has a dedicated Dockerfile to build the backend as a microservice that can be deployed in a Kubernetes cluster.
The business logic is separated from the API routes and the database access layer, following clean architecture principles.
It uses ESLint and Prettier to maintain a consistent code style and catch potential issues early in the development process.
It uses Vitest for unit testing and Supertest for integration testing to ensure the quality of the code and the functionality of the API.
It protects the API with a global per-IP rate limiter based on `express-rate-limit`, allowing 500 requests per IP per 5-minute window by default, configurable via the `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_LIMIT` environment variables and Helm values, with the health endpoint exempt.

### Database

The database is PostgreSQL.
In production, the database is provisioned separately and is not part of the application deployment.
In development, a PostgreSQL instance can be run locally inside the Minikube cluster.

### Deployment

The application can be deployed to a Kubernetes cluster using a Helm chart.
The Helm chart defines the deployment of the frontend and the backend as separate microservices and includes the required resources, such as ConfigMaps and Secrets for database connectivity.
The database is not deployed by the Helm chart and must be provisioned separately. The chart assumes that the database is already available and that connection details are provided through `values.yaml`.

### Development

To run the application in development mode, Minikube can be used to create a local Kubernetes cluster and the Helm chart can be used to deploy the application to that cluster.
Telepresence can be used to run the frontend and the backend locally while they still communicate with the other services running in the cluster, enabling a seamless development experience.
Helper scripts are provided to simplify the development workflow, such as installing dependencies, building the frontend and backend, and deploying the application to the cluster.

### CI

The application uses GitHub Actions for continuous integration.
The CI pipeline runs on every push to the `main` branch and on every pull request.
The CI pipeline includes the following steps:

- **Linting**: run ESLint to check for code style issues and potential bugs in the codebase.
- **Testing**: run Vitest and Supertest for backend unit and integration tests, and Vitest and Playwright for frontend unit and end-to-end tests.
- **Building**: build the frontend and the backend using their respective Dockerfiles to ensure that the application can be built successfully and that the Docker images are created without issues.

### Implementation Status

> This appendix tracks, as of the audit on 2026-08-01, which statements in this
> specification are **not yet implemented**, **partially implemented**, or where
> the **current implementation diverges** from the spec. Per the hierarchy of
> truth in [`AGENTS.md`](../AGENTS.md) (Specification > ADRs > code), a divergence
> here means either the code must be brought up to the spec, or the spec must be
> revisited through a product decision. Each item cites concrete file:line
> evidence. Items not listed are considered implemented as specced.

#### - Features

- **§Features line 7 — "multilingual and supports English and Italian": NOT IMPLEMENTED.**
  No `vue-i18n` (or any i18n) library is present (`apps/frontend/package.json`
  has no i18n dependency). `apps/frontend/src/main.ts` registers only Pinia and
  Vue Router. All UI strings are hardcoded English (e.g.
  `apps/frontend/src/views/LoginView.vue`, `apps/frontend/src/views/GroupDetailView.vue`).
  There are no locale files, no language-preference storage, and
  `apps/frontend/index.html` declares `lang="en"` only.

- **§Features line 8 — "Users can create an account and sign in": PARTIALLY IMPLEMENTED.**
  Backend `POST /api/auth/register` exists
  (`apps/backend/src/controllers/authController.ts`, `apps/backend/src/services/authService.ts`,
  `apps/backend/src/routes/authRoutes.ts`), and login is fully implemented end-to-end.
  The frontend, however, only ships a login form
  (`apps/frontend/src/views/LoginView.vue`); there is **no registration UI**.

- **§Features line 10 — "invite other users to join via email": IMPLEMENTED.**
  The email-keyed invitation system with accept/decline/cancel lifecycle is implemented
  (`apps/backend/src/entities/Invitation.ts`, `apps/backend/src/services/invitationService.ts`).

- **§Features line 12 — "name and image that can be updated by its members": PARTIALLY IMPLEMENTED (NAME ONLY).**
  The `Group` entity has an `imageUrl` column
  (`apps/backend/src/entities/Group.ts`) and it is rendered when set
  (`apps/frontend/src/views/GroupsView.vue`), but `updateGroup`
  (`apps/backend/src/services/groupService.ts`,
  `apps/backend/src/controllers/groupController.ts`) only accepts `name` and
  there is **no endpoint, controller, or UI to set or upload a group image**. The
  seed sets `imageUrl: null`.

- **§Features lines 72-76 — two-user group shortcuts ("You paid, split equally", "You are owed the full amount", etc., with the other options behind a "More options" action): NOT IMPLEMENTED.**
  The Add-Expense modal in `apps/frontend/src/views/GroupDetailView.vue` always
  shows the full form regardless of member count. No matching UI, translation
  strings, or component exists. The "More options" toggle and the four shortcut
  presets are specced but absent.

- **§Features line 77 — "Each group shows how much each user owes or is owed within the group": PARTIALLY IMPLEMENTED.**
  The backend only returns balances from the **current user's perspective**
  (`netForCurrentUser` plus a pairwise `perUser[]` breakdown) via
  `apps/backend/src/services/groupService.ts` (`computeBalance`), and the
  frontend only renders that pairwise view
  (`apps/frontend/src/views/GroupDetailView.vue`). The spec's canonical
  "per-member net balance" (§Balance Rules line 112) for **all** members is not
  exposed by the API and not rendered.

- **§Features line 81 — "Activities are tracked": NOT IMPLEMENTED.**
  No `Activity` / audit entity or table exists. `apps/backend/src/entities/`
  contains only `Group`, `User`, `UserIdentity`, `Expense`, `ExpenseSplit`. No
  activity feed is produced on create/update/delete/settle-up. See also the
  related Product Decisions gap on line 94 below.

- **§Features line 82 — "Group expenses can be exported as a CSV file": NOT IMPLEMENTED.**
  No CSV generation code anywhere in the repo (case-insensitive grep for `csv`
  / `text/csv` across `apps/frontend/src` and `apps/backend/src` returns nothing).
  `apps/backend/src/routes/groupRoutes.ts` has no export route, and
  `apps/backend/src/app.ts` mounts only `/api/health`, `/api/auth`, `/api/auth/oauth`,
  `/api/groups`. No `Content-Disposition`, no `Blob`, no `createObjectURL`
  usage in the frontend.

#### - Product Decisions

- **§Product Decisions line 87 — "Monetary values must be stored and processed as integer cents": PARTIALLY IMPLEMENTED.**
  Values are **processed** in integer cents
  (`apps/backend/src/services/expenseSplitMath.ts` `toCents`, allocator,
  `aggregateBalance`; frontend `apps/frontend/src/lib/splitMath.ts`), but they
  are **stored as `decimal(10, 2)`** in the database
  (`apps/backend/src/entities/Expense.ts` `@Column({ type: 'decimal', precision: 10, scale: 2 })`).
  ADR-0006 documents this deliberately. The spec wording should be reconciled
  with ADR-0006 (either tighten the wording to "processed" or migrate the
  schema to integer cents).

- **§Product Decisions line 90 — "Categories must be represented internally by stable keys, while labels are localized in the frontend": PARTIAL.**
  Stable keys exist (`apps/frontend/src/lib/categories.ts` uses kebab-case keys
  and `apps/backend/src/controllers/groupController.ts` validates them). However,
  the labels are **hardcoded English strings**, not localized — there is no i18n
  layer (see the §Features line 7 gap). The "localized labels" half of this
  decision is not yet implemented.

- **§Product Decisions line 94 — "any activity entry generated for the deletion remains part of the activity history": MOOT.**
  Tied to the §Features line 81 activity-tracking gap above. Since activity
  tracking is not implemented at all, this invariant has no observable
  effect. It will need code support before it can be considered satisfied.

#### - Architecture — Frontend

- **§Architecture line 131 — "designed to be accessible and to follow WCAG guidelines": PARTIAL.**
  There are semantic landmarks (`<main>`, `<section>`, `<label>`),
  `aria-hidden` on decorative SVGs, and visible focus rings (e.g.
  `apps/frontend/src/views/LoginView.vue`), but there is no a11y audit, no
  aria-labels on icon-only controls, and no automated a11y test. WCAG intent is
  aspirational.

#### - Architecture — Backend

- **§Architecture line 144 — "Authorization Code + PKCE flow for Google authentication": IMPLEMENTED AS GENERIC OIDC.**
  See the related §Features line 9 gap. The PKCE flow with `S256` is implemented,
  but the concrete provider is generic OIDC, not Google-specific. Spec wording
  should either move to "any OIDC provider (Google by default)" or a
  Google-specific provider file should be added.

#### - Architecture — Database

- **§Architecture lines 155-156 and 162 — "in production, the database is provisioned separately and is not part of the application deployment"; "the database is not deployed by the Helm chart": NOT IMPLEMENTED AS SPECCED.**
  The Helm chart **does** deploy PostgreSQL by default
  (`helm/doschei/templates/postgres-deployment.yaml`,
  `helm/doschei/templates/postgres-service.yaml`,
  `helm/doschei/templates/postgres-secret.yaml`,
  `helm/doschei/values.yaml` `postgres.enabled: true`). There is a toggle
  (`postgres.enabled: false`) for the production scenario, but the default
  contradicts the spec. ADR-0007 documents this divergence and should be
  reconciled with the spec — either tighten the spec to "in production, set
  `postgres.enabled: false` and provision separately" or align the chart
  default with the spec.

#### - CI

- **§CI line 176 — "Linting: run ESLint to check for code style issues and potential bugs in the codebase": NOT IMPLEMENTED IN CI.**
  ESLint configs and `npm run lint` scripts exist for both apps, but **no CI
  workflow runs ESLint**. `apps/.../eslint.config.mjs` and `.prettierrc.json`
  are present in each app. `.github/workflows/tests.yaml` only runs unit,
  integration, Playwright, and Docker builds; the PR-checks reusable workflow
  (`.github/workflows/common-pull-request-checks.yaml`) runs codeQL/Semgrep/Trivy
  and the repo's `.pre-commit-config.yaml` — which contains **no ESLint hook**
  (markdownlint, shellcheck, hadolint, ruff, actionlint, gitleaks, etc., only).
  A `npm run lint` step must be added to CI to satisfy this requirement.

#### Notes on items intentionally left unannotated

- Balance Rules (§Balance Rules lines 99-112) are implemented as specified,
  including cent-precise remainder distribution in input order, FIXED/PERCENT
  sum validation, and the canonical-ledger invariant in
  `apps/backend/src/services/expenseSplitMath.ts` and
  `apps/backend/src/services/settlementRules.ts`. The only nuance is that the
  "sum of all member balances is zero" invariant holds by construction at the
  math layer (`aggregateBalance` nets payer `+amount` against participants
  `-computedAmount`), but there is **no explicit test that sums every member's
  net balance** to assert zero, primarily because the API exposes only the
  current-user perspective. A future test would strengthen confidence in this
  invariant.
- Architecture claims that are fully implemented (Express, TypeORM, dedicated
  Dockerfiles, Helm chart with ConfigMaps/Secrets, Telepresence/Minikube helper
  scripts, GitHub Actions on `push: main` and pull requests, Docker builds in
  CI, Pinia, Vue Router, Axios, Composition API, `script setup`, Tailwind, Vite,
  PWA via `vite-plugin-pwa`) are not annotated here.
