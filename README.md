# Pizza App — API

Backend for a pizza ordering app, built while studying backend development (Sujeito Programador course).

> **Status:** work in progress. The database layer is configured; the first route (`POST /users`) validates input but does not persist anything yet.

## Stack

| Tool | Purpose |
| --- | --- |
| [Node.js](https://nodejs.org) + [TypeScript](https://www.typescriptlang.org) | Runtime and language |
| [Express 5](https://expressjs.com) | HTTP server and routing |
| [Zod](https://zod.dev) | Request validation (body, query, params) |
| [Prisma ORM 8](https://www.prisma.io) | Database access, typed from a data contract |
| [PostgreSQL 17](https://www.postgresql.org) (Docker) | Database |
| [tsx](https://tsx.is) | Runs TypeScript directly in development, with watch mode |
| [pnpm](https://pnpm.io) | Package manager |

## Getting started

### Prerequisites

- Node.js
- pnpm
- Docker (with Docker Compose)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3333` | Port the API listens on |
| `DATABASE_URL` | `postgresql://pizza:pizza@localhost:5435/pizza_app` | Postgres connection string (matches `docker-compose.yml`) |

The connection string format is `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`.

### 3. Start the database

```bash
docker compose up -d
```

This starts a `postgres:17-alpine` container named `pizza_app_postgres`:

- **User / password / database:** `pizza` / `pizza` / `pizza_app` (local development only)
- **Port:** `5435` on your machine → `5432` inside the container. A non-default port is used to avoid clashing with other Postgres instances already running on `5432`.
- **Data** is stored in the `pizza_app_pgdata` volume, so it survives container restarts.
- A **healthcheck** (`pg_isready`) reports when the database is ready to accept connections.

### 4. Create the tables

Apply the committed migrations from `migrations/`:

```bash
pnpm prisma contract emit                 # generate contract.json / contract.d.ts
pnpm prisma db migrate --advance-ref db   # apply the migrations to your local database
```

### 5. Run the API

```bash
pnpm dev
```

The API runs at `http://localhost:3333` and restarts automatically on file changes.

## Database (Docker + Prisma)

### Docker commands

| Command | What it does |
| --- | --- |
| `docker compose up -d` | Start the database in the background |
| `docker compose stop` | Stop the database (data is kept) |
| `docker compose down` | Remove the container (data is kept in the volume) |
| `docker compose down -v` | Remove the container **and the data** (fresh start) |
| `docker compose logs -f postgres` | Follow the database logs |
| `docker exec -it pizza_app_postgres psql -U pizza -d pizza_app` | Open a SQL shell (`\dt` lists tables, `\q` quits) |

To use a GUI client (Beekeeper Studio, DBeaver, TablePlus…), connect to `localhost:5435` with the credentials above.

### Prisma workflow

The data model lives in [`src/prisma/contract.prisma`](src/prisma/contract.prisma). Every schema change goes through a **migration**: a file in `migrations/` that describes the change and is committed to git, so the schema history is versioned and reviewable.

To change the schema:

1. Edit the models in `contract.prisma`.
2. Regenerate the contract files:
   ```bash
   pnpm prisma contract emit
   ```
3. Plan a migration (writes it to `migrations/`; does **not** touch the database):
   ```bash
   pnpm prisma migration plan --name add_user_phone
   ```
4. Review the generated migration, then apply it to your local database:
   ```bash
   pnpm prisma db migrate --advance-ref db
   ```
5. Commit the contract files **and** the new migration together.

#### What is the `db` ref?

A **ref** is a named pointer to a contract version, stored in `migrations/app/refs/`. The `db` ref records which version your local database should be at, so `migration plan` only includes the changes made since then.

`--advance-ref db` moves that pointer forward after the migration is applied. Without it, `db migrate` applies the migration but leaves the ref where it was, so the next `migration plan` would include changes you've already applied.

Useful commands:

| Command | What it does |
| --- | --- |
| `pnpm prisma contract emit` | Regenerate `contract.json` and `contract.d.ts` from `contract.prisma` |
| `pnpm prisma migration plan --name <name>` | Create a migration from the contract changes |
| `pnpm prisma db migrate --advance-ref db` | Apply pending migrations locally and advance the `db` ref |
| `pnpm prisma migration status` | Show which migrations are pending |
| `pnpm prisma migration list` | List the migrations on disk |
| `pnpm prisma migration log` | Show the migration history executed on the database |
| `pnpm prisma db verify` | Check that the database matches the contract |

> Avoid mixing in `prisma db update`: it changes the database without writing a migration, and a later `db migrate` on that database fails with `MIGRATION.MARKER_MISMATCH`.

Querying from the code goes through the typed client in [`src/prisma/db.ts`](src/prisma/db.ts):

```typescript
import { db } from './prisma/db'

const user = await db.orm.public.User
  .where({ email: 'alice@example.com' })
  .first()
```

More details about Prisma 8 are in [`prisma-8.md`](prisma-8.md).

Current models: `User` (with `STAFF` / `ADMIN` roles), `Category`, `Product`, `Order` and `Item` (the products in an order).

## Project structure

```
api/
├── docker-compose.yml        # Postgres container
├── prisma.config.ts          # Prisma CLI config (contract path + DATABASE_URL)
├── migrations/               # Migrations + refs (commit this folder)
└── src/
    ├── server.ts             # App entry point: global middlewares + router
    ├── routes.ts             # Route definitions
    ├── controllers/          # Handle HTTP: read the request, call a service, send the response
    │   └── user/CreateUserController.ts
    ├── services/             # Business logic (and, later, database access)
    │   └── user/CreateUserService.ts
    ├── middlewares/
    │   └── validateSchema.ts # Validates req.body/query/params against a Zod schema
    ├── schemas/              # Zod schemas for each route
    │   └── userSchema.ts
    └── prisma/
        ├── contract.prisma   # Data model (edit this)
        ├── contract.json     # Compiled contract (generated)
        ├── contract.d.ts     # Contract types (generated)
        └── db.ts             # Database client
```

### Request flow

```
Request → express.json() → cors() → router
        → validateSchema(schema)  ── invalid → 400 { message, errors[] }
        → Controller.handle()
        → Service.execute()
        → Response
```

- **Controllers** only deal with HTTP (`req` / `res`).
- **Services** hold the business rules, so they can be reused and tested without Express.
- **validateSchema** is a middleware factory: it receives a Zod schema and returns a middleware that validates `{ body, query, params }` before the controller runs.

## API routes

### `POST /users` — create a user

Body:

```json
{
  "name": "Vinicius",
  "email": "vinicius@example.com",
  "password": "123456"
}
```

Validation rules:

| Field | Rule |
| --- | --- |
| `name` | String, at least 3 characters |
| `email` | Valid email |
| `password` | String, at least 6 characters |

Invalid input returns `400`:

```json
{
  "message": "Invalid parameters",
  "errors": [
    { "field": "email", "message": "Email is invalid" }
  ]
}
```

Example:

```bash
curl -X POST http://localhost:3333/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Vinicius","email":"vinicius@example.com","password":"123456"}'
```

> Currently the service only returns a placeholder message; saving the user to the database is the next step.

## Next steps

- [ ] Create the first migration for the pizza app models
- [ ] Save users to the database in `CreateUserService` (with a hashed password)
- [ ] Return `201 Created` when a user is created
