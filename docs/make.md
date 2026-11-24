# Make commands

Every command is a target of the `Makefile`. Run them from the repository root. Most start Docker containers: Docker must be running.

## Starting and stopping

| Command | What it does |
|---|---|
| `make` | Production mode: builds the images and starts everything in the background, behind nginx over HTTPS. At the end it prints the app address, the Admin email and where its password is (`ADMIN_PASSWORD` in `.env`), never the password itself. |
| `make dev` | Development mode with hot reload: edits in `web/` show up without rebuilding. It removes the old `app` container with its `node_modules` volume first, so new dependencies are installed every time. Loads the demo data by itself at start. Use `make logs` to see the output. |
| `make down` | Stops and removes the containers. The database data is kept. |
| `make clean` | Same as `make down`. |
| `make fclean` | Removes everything the project created: the containers and the network; the volumes, that is **the database, the uploaded files** and the HTTPS certificate (the next start makes a new one); and the images it built (`app`, `migrate`, `nginx` and `transcendence-app-dev`), plus the old untagged versions of those images that rebuilding left behind (about 1.5 GB each). Those untagged versions are found by the project names `transcendence` and `transcendence-test`, which every clone on the computer shares, so the ones from other clones are removed too. `transcendence-app-dev` is the `make dev` / `make test` image, shared by every clone on the computer, so it is removed for all of them (the next `make dev` or `make test` rebuilds it). Downloaded images (PostgreSQL, Mailpit) are kept, since other projects may use them. |
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
| `make test` | Runs every test (normal and `*.db.test.ts`) in Docker against an empty PostgreSQL test database. To run only some, pass `args` (lowercase, like `name` in `make migrate`): `make test args="tests/unit/training/rpe.test.ts"`. Paths are relative to `web/`, and only file paths and `-t "name"` filters work: no single quotes or shell characters (see [testing.md](testing.md)). It can run while `make dev` is up and never touches `pgdata`. |
| `make test-nginx` | Checks that nginx is the only way in, over HTTPS. Needs `make` or `make dev` running. |
| `make check-compose` | Checks that the three Compose setups (production, development, test) parse. The CI runs it too. |

## Support

| Command | What it does |
|---|---|
| `make env` | Creates `.env` or adds the variables it is missing, and generates the secrets that are empty. `make`, `make dev`, `make seed`, `make test` and `make check-compose` call it, so you rarely run it by hand. |

## Variables

- `DEV_CONTAINER_USER`: user of the `make dev` and `make test` containers. It is `root` with rootless Docker (the campus), where `node` cannot enter the mounted `./web`, and empty otherwise. To override it: `DEV_CONTAINER_USER=root make dev`.
