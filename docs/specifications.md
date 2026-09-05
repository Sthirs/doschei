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
- Users can search categories by name within the category picker when choosing an expense category.
- When creating or editing an expense, if no category has been selected yet, the application automatically selects the category whose past descriptions in the same group best match the entered description; when no past expense matches, it instead selects a category whose own name fully or partially matches the entered description.
- Users can add an expense and choose who paid for it and how it is split among the users in the group.
- When adding an expense, the payer field starts out preselected with the signed-in user.
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
- Users can view a group's total spend for three consecutive months side by side, with the portion of each month that is their own share shown within the same bar, and can move the three-month window backwards and forwards one month at a time.
- Users can view their profile picture when one is set, shown in place of the initials avatar; users can upload or change their profile picture from the account screen using the device's standard file picker (gallery, camera, or other sources); JPEG/PNG/WebP up to 5 MB are accepted, normalized server-side, and returned embedded in API responses.
- A member's profile picture, when set, is shown to other members of their groups wherever that member is represented (member lists, payer selection, split details, and similar views).
- Users can select the interface language (English or Italian) in their account. The language defaults to the device/browser language captured at registration; the saved preference applies at sign-in and takes effect immediately when changed.

## Product Decisions

- The first release targets a single currency per workspace, with EUR as the default currency.
- Monetary values must be stored and processed as integer cents to avoid floating-point rounding issues.
- Expense dates are stored as calendar dates and represent the date selected by the user, without time-of-day semantics.
- The user interface supports English and Italian. The interface language resolves in the following order: the user's saved preference (selectable in the account, stored server-side) → the device/browser language captured at registration → the browser language for anonymous visitors → English.
- Categories must be represented internally by stable keys, while labels are localized in the frontend.
- All group members share the same permissions for creating, editing, deleting, and exporting expenses, as well as for recording settle-up payments.
- Editing an expense allows changing any of its fields, including its description, amount, date, category, payer, and split details.
- A settle-up payment is represented as a special expense entry so that it appears in the same ledger and affects balances consistently.
- CSV export must include both regular expenses and settle-up entries that are currently visible in the group ledger.
- Monthly spend totals count only regular expenses; settle-up entries are excluded, because a settle-up moves money between members rather than spending it. A member's own share of a month is the total they are responsible for under the expense splits, not the amount they paid out. The three-month window starts at the current month and never extends into the future.
- Deleting an expense removes it from active balances immediately; any activity entry generated for the deletion remains part of the activity history.
- The canonical financial source of truth is the ledger of expenses and settlement entries; balances are always derived from that ledger.
- The display name is the single editable profile field; the email address is immutable after account creation and is never accepted by the profile-update API.
- Category auto-selection learns only from the expense history of the group the expense belongs to, is computed entirely client-side, ignores settle-up entries, applies only while the category is still the default and was not manually chosen in the form, and never overrides a manual selection. The taxonomy-name fallback matches against category labels in the user's active interface language.

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
When a new application version is detected, the client automatically clears all cached assets and service workers and reloads once, keeping the user signed in.
The Account screen displays the version of the deployed application.
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

> This appendix tracks, as of the audit on 2026-09-04, which statements in this
> specification are **not yet implemented**, **partially implemented**, or where
> the **current implementation diverges** from the spec. Per the hierarchy of
> truth in [`AGENTS.md`](../AGENTS.md) (Specification > ADRs > code), a divergence
> here means either the code must be brought up to the spec, or the spec must be
> revisited through a product decision. Items not listed are considered
> implemented as specced.
>
> Entries quote the statement they annotate rather than citing its line number.
> Line numbers rot as the spec grows: the 2026-08-01 revision of this appendix
> cited them, and by this audit 11 of its 15 citations pointed at the wrong
> statement.

#### - Features

- **"The application is multilingual and supports English and Italian": IMPLEMENTED (2026-08).**
  vue-i18n v11 with EN/IT catalogs (`apps/frontend/src/i18n/`), per-user
  `language` column exposed through all auth responses, language selector in
  the account screen, device-language capture at registration, and localized
  category labels behind stable keys. See [`ADR-0018`](adr/0018-internationalization-en-it.md)
  and the Playwright proof in `tests/e2e/account/language.spec.ts`.

- **"Users can create an account and sign in to the application": PARTIALLY IMPLEMENTED.**
  Backend `POST /api/auth/register` exists
  (`apps/backend/src/controllers/authController.ts`, `apps/backend/src/services/authService.ts`,
  `apps/backend/src/routes/authRoutes.ts`), gated by `AUTH_LOCAL_REGISTRATION_ENABLED`,
  and login is fully implemented end-to-end. The frontend, however, only ships a
  login form (`apps/frontend/src/views/LoginView.vue`); there is **no registration
  UI**, and nothing under `apps/frontend/src` calls `/api/auth/register`.

- **"Users can create groups and invite other users to join via email": IMPLEMENTED.**
  The email-keyed invitation system with accept/decline/cancel lifecycle is implemented
  (`apps/backend/src/entities/Invitation.ts`, `apps/backend/src/services/invitationService.ts`),
  with the Playwright proof in `tests/e2e/invitations/invitations.spec.ts`.

- **"A group has a name and an image that can be updated by its members": IMPLEMENTED (2026-08).**
  The `Group` entity has an `imageUrl` column
  (`apps/backend/src/entities/Group.ts`) and it is rendered when set
  (`apps/frontend/src/views/GroupsView.vue`). Name and image are separate
  endpoints: `PATCH /api/groups/:id` takes only `name`
  (`apps/backend/src/controllers/group/groupHandlers.ts`), while the image is
  uploaded as `multipart/form-data` to `POST /api/groups/:id/image`
  (`updateGroupImage`, `apps/backend/src/routes/groupRoutes.ts`). The frontend
  provides a file picker in the group settings screen. See
  [`ADR-0019`](adr/0019-image-upload-architecture.md).

- **"In groups with exactly two users, the following shortcuts are available for faster data entry, while the other options are shown behind a **More options** action": NOT IMPLEMENTED.**
  The expense form is a routed page since [`ADR-0012`](adr/0012-routed-pages-for-expense-settleup-forms.md)
  (`apps/frontend/src/views/ExpenseFormView.vue` with
  `apps/frontend/src/components/expense-form/`), and it always shows the full
  form regardless of member count. No matching UI, translation strings, or
  member-count branching exists. The "More options" toggle and the four
  shortcut presets are specced but absent.

- **"Each group shows how much each user owes or is owed within the group": PARTIALLY IMPLEMENTED.**
  The backend only returns balances from the **current user's perspective** —
  `netForCurrentUser` plus a `perUser[]` breakdown that is pairwise against the
  current user, not a per-member net
  (`apps/backend/src/services/group/balanceComputation.ts`) — and the frontend
  renders only that pairwise view
  (`apps/frontend/src/components/group-detail/BalanceCard.vue`). The spec's
  canonical "per-member net balance" (§Balance Rules) for **all** members is not
  exposed by the API and not rendered.

- **"Activities are tracked": NOT IMPLEMENTED.**
  No `Activity` / audit entity or table exists. `apps/backend/src/entities/`
  contains only `Group`, `User`, `UserIdentity`, `Invitation`, `Expense`, and
  `ExpenseSplit`, and no activity feed is produced on
  create/update/delete/settle-up. See also the related Product Decisions gap
  below.

- **"Users can view their profile picture when one is set … JPEG/PNG/WebP up to 5 MB are accepted, normalized server-side, and returned embedded in API responses": IMPLEMENTED (2026-08).**
  The `User` entity has an `imageDataUrl` column
  (`apps/backend/src/entities/User.ts`) storing a base64 data URL. The
  `PATCH /api/auth/me/image` endpoint accepts `multipart/form-data` uploads
  (`apps/backend/src/controllers/authController.ts`,
  `apps/backend/src/services/authService.ts`), validates MIME type (JPEG/PNG/WebP)
  and size (≤ 5 MB) and normalizes via `sharp` to a data URL
  (`apps/backend/src/services/imageService.ts`), returning the updated user with
  the embedded image. The frontend account screen provides a file picker and
  displays the image or falls back to the initials avatar. See
  [`ADR-0019`](adr/0019-image-upload-architecture.md).

#### - Product Decisions

- **"Monetary values must be stored and processed as integer cents to avoid floating-point rounding issues": PARTIALLY IMPLEMENTED.**
  Values are **processed** in integer cents
  (`apps/backend/src/services/expenseSplitMath.ts` `toCents`, allocator,
  `aggregateBalance`; frontend `apps/frontend/src/lib/splitMath.ts`), but they
  are **stored as `decimal(10, 2)`**: `Expense.amount`
  (`apps/backend/src/entities/Expense.ts`) and `ExpenseSplit.shareValue` /
  `ExpenseSplit.computedAmount` (`apps/backend/src/entities/ExpenseSplit.ts`).
  ADR-0006 documents this deliberately. The spec wording should be reconciled
  with ADR-0006 (either tighten the wording to "processed" or migrate the
  schema to integer cents).

- **"Categories must be represented internally by stable keys, while labels are localized in the frontend": IMPLEMENTED (2026-08).**
  The `label` field was removed from `CategoryDefinition`; labels live in the
  EN/IT catalogs under `categories.*` and the picker renders/searches them via
  the active locale. See [`ADR-0018`](adr/0018-internationalization-en-it.md).

- **"any activity entry generated for the deletion remains part of the activity history": MOOT.**
  Tied to the "Activities are tracked" gap above. Since activity tracking is not
  implemented at all, this invariant has no observable effect. It will need code
  support before it can be considered satisfied.

#### - Architecture — Frontend

- **"It is designed to be accessible and to follow WCAG guidelines": PARTIAL.**
  There are semantic landmarks (`<main>`, `<section>`, `<label>`), `aria-hidden`
  on decorative SVGs, visible focus rings, and icon-only controls do now carry
  `aria-label`s wired to localized catalog keys (for example
  `groups.thumbnailAria`, `account.signOutAria`,
  `categoryPicker.dialogAriaLabel`). What is still missing is any a11y audit and
  any automated a11y test, so full WCAG conformance remains unverified rather
  than merely aspirational.

#### - Architecture — Database

- **"In production, the database is provisioned separately and is not part of the application deployment"; "The database is not deployed by the Helm chart and must be provisioned separately": NOT IMPLEMENTED AS SPECCED.**
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

- **"**Linting**: run ESLint to check for code style issues and potential bugs in the codebase": NOT IMPLEMENTED IN CI.**
  ESLint configs and `npm run lint` scripts exist for both apps, but **no CI
  workflow runs ESLint**. `.github/workflows/tests.yaml` only runs unit,
  integration, Playwright, and Docker builds; the PR-checks reusable workflow
  (`.github/workflows/common-pull-request-checks.yaml`) runs CodeQL/Semgrep/Trivy
  and the repo's `.pre-commit-config.yaml` — which contains **no ESLint hook**
  (markdownlint, shellcheck, hadolint, ruff, actionlint, gitleaks, etc., only).
  A `npm run lint` step must be added to CI to satisfy this requirement. Open
  since the first revision of this appendix (2026-08-01).

#### Notes on items intentionally left unannotated

- Balance Rules (§Balance Rules) are implemented as specified, including
  cent-precise remainder distribution in input order, FIXED/PERCENT sum
  validation, and the canonical-ledger invariant in
  `apps/backend/src/services/expenseSplitMath.ts` and
  `apps/backend/src/services/settlementRules.ts`. The only nuance is the "sum of
  all member balances is zero" invariant. It holds by construction at the math
  layer (`aggregateBalance` nets payer `+amount` against participants
  `-computedAmount`), and tests assert the related pairwise identity that
  `sum(perUser) === netForCurrentUser` (`apps/backend/tests/groupService.test.ts`,
  `apps/backend/tests/integration/expenses-splits.test.ts`). What is still
  untested is the group-wide sum across **every** member, primarily because the
  API exposes only the current-user perspective — the same gap as the §Features
  per-member balance item above.
- Architecture claims that are fully implemented (Express, TypeORM, dedicated
  Dockerfiles, Helm chart with ConfigMaps/Secrets, Telepresence/Minikube helper
  scripts, GitHub Actions on `push: main` and pull requests, Docker builds in
  CI, Pinia, Vue Router, Axios, Composition API, `script setup`, Tailwind, Vite,
  PWA via `vite-plugin-pwa`, per-IP rate limiting, CSV export, client cache
  purge on new deploy, and the group monthly totals chart) are not annotated
  here.
