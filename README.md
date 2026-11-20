*This project has been created as part of the 42 curriculum by jeanpaul, <login2>.*

# Omnisport Hub

## Description
Omnisport Hub is a B2B Sports Management SaaS built to centralize administrative, tactical, physical, and medical management for sports teams. It eliminates information fragmentation by providing a secure, real-time, and role-based environment.

Key Features:
- **Unified Calendar**: Manage all team events (matches, training, medical) seamlessly.
- **Advanced Permissions**: Distinct roles for Managers (full access), Staff (segmented writing), and Athletes (read-only).
- **Real-time Communication**: Staff chat using Server-Sent Events (SSE).
- **Analytics Dashboard**: Multi-sport performance tracking via dynamic JSONB data models.
- **File Management**: Tactical and medical document uploads via S3-compatible storage.

## Instructions
### Prerequisites
- Docker & Docker Compose
- Make

### Setup
From a fresh clone, one command starts everything:

```sh
make
```

It creates `.env` with random secrets if it is missing, builds the images and starts the database, the app, the test mail inbox and NGINX. The first run downloads and installs everything, so it takes a few minutes.

Then open **https://localhost:8443**. The certificate is self-signed, so the browser shows a warning the first time: accept it to continue. NGINX only listens on this HTTPS port; there is no plain HTTP access.

From another computer on the same network, use the IP of the computer that ran `make`: `https://<IP>:8443`. `make` prints that address when it finishes (`scripts/host-ip.sh`). On WSL, or when it cannot find it (for example macOS without `ip`), it prints `<this computer's IP>` instead: look the address up by hand. With a VPN on, it may print the VPN address, which the other computers cannot reach. Only one computer runs `make`; the others just open the address. The certificate is made for `localhost`, so from another computer the warning also says the name does not match: accept it the same way.

In a fresh clone or after `make fclean`, `make` starts with an empty database (all the tables) and one account: the **initial Admin**, `admin@stridesync.local`, with its password in `ADMIN_PASSWORD` in `.env`. It is created on every start if it does not exist yet, and never changed afterwards. Register any other user from the app.

To show the app with data, load the demo data **before the evaluation**:

```sh
make seed
```

It adds the demo users (`admin@demo.local`, `manager@demo.local`, `athlete1@demo.local`, `athlete2@demo.local`), the Club Demo and its training history. Their password is `SEED_USER_PASSWORD` in `.env`. All the demo data, users and their roles included, is defined in [web/prisma/seed.ts](web/prisma/seed.ts). It can run twice without duplicating anything, and training logs added by hand to the demo sessions are kept: the training history is created only on the first run, so its dates are those of that day (new dates need a new database, with `make fclean`). `make dev` loads the same data by itself on every start, and it stays afterwards in `make` too: only `make fclean` deletes the database.

The passwords in `.env` are generated randomly the first time and are never printed: open `.env` to read them.

| Command | What it does |
|---|---|
| `make` | Production mode: builds the images and starts everything in the background |
| `make dev` | Development mode: same, but `./web` is mounted and the app reloads on save; loads the demo data |
| `make seed` | Loads the demo data with the app in `make` mode (demo users, Club Demo, sessions); safe to run twice |
| `make test` | Runs every test in Docker against an empty test database ([docs/testing.md](docs/testing.md)) |
| `make test-nginx` | Checks that NGINX is the only way in, over HTTPS (needs `make` or `make dev` running) |
| `make migrate name=<name>` | Creates a Prisma migration from `web/prisma/schema.prisma` and applies it (needs `make dev` running) |
| `make logs` / `make ps` | Follows the logs / lists the containers |
| `make down` / `make clean` | Stops and removes the containers; the data is kept |
| `make fclean` | Removes everything the project created: the containers and the network; the volumes, that is **the database, the uploaded files** and the HTTPS certificate (the next start makes a new one); and the images it built (`app`, `migrate`, `nginx` and `transcendence-app-dev`), plus the old untagged versions of those images that rebuilding left behind (about 1.5 GB each). Those untagged versions are found by the project names `transcendence` and `transcendence-test`, which every clone on the computer shares, so the ones from other clones are removed too. `transcendence-app-dev` is the `make dev` / `make test` image, shared by every clone on the computer, so it is removed for all of them (the next `make dev` or `make test` rebuilds it). Downloaded images (PostgreSQL, Mailpit) are kept, since other projects may use them |
| `make re` | `make clean` followed by `make` |

The port can be changed with `HTTPS_PORT` in `.env`.

With rootless Docker (as on the 42 campus computers), `make dev` and `make test` run their container as `root`, which there is your own user: the default `node` user cannot enter the mounted `web` folder. The Makefile detects it by itself (`scripts/container-user.sh`); nothing changes with normal Docker. If your `uploads` volume was created before #236 and has no `avatars/` folder yet, the first avatar uploaded under `make dev` creates that folder as `root`, and then `make` cannot save avatars there: run `make fclean` once, which **deletes the database and the uploaded avatars**.

### Conventions
- **Frontend tests**: automated frontend tests live in `web/tests/`, grouped by component or feature. Component tests go in `web/tests/components/` and import the code through the `@/` alias.
- **Test mail inbox**: mail sent by the app goes to a test inbox at `/mailpit/`, and nothing leaves Docker. See [docs/mail.md](docs/mail.md).
- **Running the tests**: `make test` runs every test in Docker against an empty PostgreSQL test database. See [docs/testing.md](docs/testing.md).

## Resources
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma ORM](https://www.prisma.io/)
- [MinIO](https://min.io/)
- [Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

*AI Usage: AI tools were used during the initial system design phase to help architecture planning (e.g., structuring the Docker topology, deciding on SSE vs WebSockets) and domain modeling.*

## Team Information - To be filled
- **<login1>**: Product Owner
- **<login2>**: Project Manager
- **<login3>**: Project Manager
- **<login4>**: Technical Lead
- **<loginX>**: Developer

## Technical Stack
- **Frontend/Backend Framework**: Next.js (App Router)
- **Database**: PostgreSQL (using JSONB for flexible metrics)
- **Storage**: MinIO (AWS S3 Compatible)
- **Proxy/Security**: NGINX with OpenSSL self-signed certificates
- **Authentication**: NextAuth.js (Auth.js)

### Justification for Major Choices
- **Next.js Full-Stack**: Selected to unify the codebase, reducing context switching and deployment complexity while fulfilling both frontend and backend requirements.
- **MinIO**: Used to mimic enterprise cloud architecture locally, providing a robust solution for the file upload module without relying on local volumes.
- **SSE + Postgres LISTEN/NOTIFY**: Chosen for real-time features to maintain a strictly HTTP-based stack, avoiding the overhead of maintaining a separate WebSocket server.

## Modules - Needs review.
- **Web (Major - 2pts)**: Next.js used for both frontend and backend.
- **User interaction (Major - 2pts)**: Real-time chat via SSE and contact network.
- **Advanced permissions system (Major - 2pts)**: Role-based access control (Manager, Staff, Athlete).
- **Organization system (Major - 2pts)**: Creation and management of sports clubs.
- **Analytics dashboard (Major - 2pts)**: Dynamic metric visualization.
- **User Management (Major - 2pts)**: Standard user auth and profiles.
- **File upload (Minor - 1pt)**: MinIO integration.
- **ORM (Minor - 1pt)**: Prisma.
**Total Target**: 14 points
