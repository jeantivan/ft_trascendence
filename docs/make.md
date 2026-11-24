# Make commands

Every command is a target of the `Makefile`. Run them from the repository root. Most start Docker containers: Docker must be running.

## Starting and stopping

| Command | What it does |
|---|---|
| `make` | Production mode: builds the images and starts everything in the background, behind nginx over HTTPS. At the end it prints the app address, the Admin email and where its password is (`ADMIN_PASSWORD` in `.env`), never the password itself. |
| `make dev` | Development mode with hot reload: edits in `web/` show up without rebuilding. It removes the old `app` container with its `node_modules` volume first, so new dependencies are installed every time. Loads the demo data by itself at start. Use `make logs` to see the output. |
| `make down` | Stops and removes the containers. The database data is kept. |
| `make clean` | Same as `make down`. |
| `make fclean` | `make down` plus removing the volumes and the images of this project. **Deletes the database data.** |
| `make re` | `make clean` and then `make`. Sequential on purpose: with `make -j` both could run at once. |

If `make` or `make dev` fails to start, it prints the last lines of the `migrate` container (where the reason usually is) and explains it when PostgreSQL rejected the password.

## Looking at what runs

| Command | What it does |
|---|---|
| `make ps` | Lists the containers and their state. |
| `make logs` | Follows the logs of all the containers. Ctrl+C stops following, not the containers. |

## Data

| Command | What it does |
|---|---|
| `make seed` | Loads the demo data (demo users, Club Demo and its sessions). It applies the migrations first and starts the database if it is not up, so it also works before the first `make`. Safe to run twice: nothing is duplicated. The demo password is `SEED_USER_PASSWORD` in `.env`. |
| `make migrate name=add_users` | Creates a Prisma migration from the changes in `web/prisma/schema.prisma`, applies it and regenerates the client. Needs `make dev` running. The new file lands in `web/prisma/migrations/`. |

**Warning for `make migrate`:** if Prisma finds the database out of step with the migrations, it offers to **reset** it (all data lost). Answer `n` unless losing the data is fine. Never edit a migration that is already applied: create another one.

## Checks

| Command | What it does |
|---|---|
| `make test` | Runs every test (normal and `*.db.test.ts`) in Docker against an empty PostgreSQL test database. See [testing.md](testing.md). It can run while `make dev` is up and never touches `pgdata`. |
| `make test-nginx` | Checks that nginx is the only way in, over HTTPS. Needs `make` or `make dev` running. |
| `make check-compose` | Checks that the three Compose setups (production, development, test) parse. The CI runs it too. |

## Support

| Command | What it does |
|---|---|
| `make env` | Creates `.env` or adds the variables it is missing, and generates the secrets that are empty. The other targets call it, so you rarely run it by hand. |

## Variables

- `DEV_CONTAINER_USER`: user of the `make dev` and `make test` containers. It is `root` with rootless Docker (the campus), where `node` cannot enter the mounted `./web`, and empty otherwise. To override it: `DEV_CONTAINER_USER=root make dev`.
