# Testing

The tests use [Vitest](https://vitest.dev/) and live in `web/tests/`.

## Two ways to run them

| Command | Where | Runs |
|---|---|---|
| `make test` | Docker, with an empty PostgreSQL test database | **Every test**: the normal ones and the `*.db.test.ts` files |
| `npm test` (inside `web/`) | Your machine, no database | The normal tests. The `*.db.test.ts` files are skipped and Vitest prints a warning saying so |

Run `make test` before opening a pull request. The CI runs every test too, against its own PostgreSQL database.

## `make test`

`make test` uses `docker-compose.test.yml`, a separate Compose project (`transcendence-test`):

- `db-test`: the same PostgreSQL image as production (`postgres:18.4-alpine`). Its data lives in memory, so it starts empty on every run. It publishes no ports. The database is `${POSTGRES_DB}_test` (`transcendence_test`), with the user and password from `.env`.
- `test`: the `make dev` image with `./web` mounted. It runs `prisma generate`, then `prisma migrate deploy`, then `npm test`. There is no seed: each test creates and removes its own data.

When the tests finish, `make test` always removes both containers, also when a test fails or you press Ctrl+C. It exits with the result of the tests.

It never touches the `make` / `make dev` containers or the `pgdata` volume, so it can run while `make dev` is up.

## Tests that need the database

Name them `*.db.test.ts`. They run only when `DATABASE_URL_TEST` is set: `make test` and the CI set it, so you never need to add it to `.env`.

`web/vitest.config.mts` protects the development database:

- If the database name in `DATABASE_URL_TEST` does not end in `_test`, Vitest refuses to start.
- When `DATABASE_URL_TEST` is set, `DATABASE_URL` is replaced by it, so Prisma and the realtime listener also use the test database.
- In the CI, a missing `DATABASE_URL_TEST` is an error: the database tests can never be skipped there.

## What the test database checks, and what it does not

It checks:

- That the code works against the same PostgreSQL as production (same image and version).
- That every migration applies to an empty database, with the same command as the `migrate` service (`prisma migrate deploy`).
- The database rules that in-memory tests do not have: unique fields, foreign keys, `onDelete` and `CHECK` constraints.
- Concurrent requests: real PostgreSQL transactions and locks.

It does not check:

- Migrations on a database **with data**: `db-test` always starts empty.
- The real configuration of each machine (`.env`), NGINX or HTTPS.
- Speed with large amounts of data.
- The demo data (seed).

Check these by hand before the evaluation.
