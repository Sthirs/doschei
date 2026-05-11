# Do Schèi

Do Schèi is a web application that allows users to track shared expenses and split them with other users.

## Features
- The application is multilingual and supports English and Italian.
- Users can create an account and sign in to the application.
- Users can sign in with their Google account.
- Users can create groups and invite other users to join via email.
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

## Product Decisions
- The first release targets a single currency per workspace, with EUR as the default currency.
- Monetary values must be stored and processed as integer cents to avoid floating-point rounding issues.
- Expense dates are stored as calendar dates and represent the date selected by the user, without time-of-day semantics.
- The user interface supports English and Italian. The application should use the user's saved language preference when available, and fall back to English otherwise.
- Categories must be represented internally by stable keys, while labels are localized in the frontend.
- All group members share the same permissions for creating, editing, deleting, and exporting expenses, as well as for recording settle-up payments.
- A settle-up payment is represented as a special expense entry so that it appears in the same ledger and affects balances consistently.
- CSV export must include both regular expenses and settle-up entries that are currently visible in the group ledger.
- Deleting an expense removes it from active balances immediately; any activity entry generated for the deletion remains part of the activity history.
- The canonical financial source of truth is the ledger of expenses and settlement entries; balances are always derived from that ledger.

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
- It supports local authentication and authentication via Google.
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
It uses Jest and Vue Test Utils for unit testing, and Cypress for end-to-end testing to ensure the quality of the code and the functionality of the application.
It has a dedicated Dockerfile to build the frontend as a microservice that can be deployed in a Kubernetes cluster.

### Backend
The backend is built with Node.js and TypeScript.
It exposes a REST API that the frontend can consume to perform CRUD operations on the data.
It handles user authentication and authorization.
It implements the Authorization Code + PKCE flow for Google authentication and also supports local authentication using email and password.
It uses Express.js as the web framework and TypeORM as the ORM to interact with the database.
It is designed to be scalable and to handle a large number of requests.
It has a dedicated Dockerfile to build the backend as a microservice that can be deployed in a Kubernetes cluster.
The business logic is separated from the API routes and the database access layer, following clean architecture principles.
It uses ESLint and Prettier to maintain a consistent code style and catch potential issues early in the development process.
It uses Jest for unit testing and Supertest for integration testing to ensure the quality of the code and the functionality of the API.

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
- **Testing**: run Jest and Supertest for backend unit and integration tests, and Jest and Cypress for frontend unit and end-to-end tests.
- **Building**: build the frontend and the backend using their respective Dockerfiles to ensure that the application can be built successfully and that the Docker images are created without issues.

## Mockups
The application mockups are available in [`docs/mockups`](./mockups).

| File | Screen / Flow | Suggested purpose | Notes |
| --- | --- | --- | --- |
| `create-group.jpg` | Create group | Create a new group with name and image | Group creation entry point |
| `group-screen-1.jpg` | Group screen | Group overview | Likely shows balances and recent expenses |
| `group-screen-2.jpg` | Group screen | Alternate group overview state | Use together with `group-screen-1.jpg` to define variations |
| `expenses-list.jpg` | Expenses list | Browse group expenses | Likely the main ledger view |
| `add-expense-1.jpg` | Add expense | Expense creation step 1 | Base form fields |
| `add-expense-2.jpg` | Add expense | Expense creation step 2 | Additional split or participant details |
| `expense-select-date.jpg` | Date picker | Select the expense date | Date selection flow |
| `expense-select-split-mode.jpg` | Split mode selection | Choose equal, exact, percentage, or shortcuts | Relevant for the two-user shortcut flow |
| `categories-list-1.jpg` | Categories list | Browse expense categories | Category selection state 1 |
| `categories-list-2.jpg` | Categories list | Browse expense categories | Category selection state 2 |
| `categories-list-3.jpg` | Categories list | Browse expense categories | Category selection state 3 |
| `categories-list-4.jpg` | Categories list | Browse expense categories | Category selection state 4 |
| `categories-list-5.jpg` | Categories list | Browse expense categories | Category selection state 5 |
| `activities.jpg` | Activity feed | View recent group activity | Audit-style timeline |
| `seattle-up-1.jpg` | Settle up | Settle-up flow step 1 | Filename is assumed to refer to the settle-up flow |
| `seattle-up-2.jpg` | Settle up | Settle-up flow step 2 | Filename is assumed to refer to the settle-up flow |
