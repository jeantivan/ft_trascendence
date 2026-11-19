COMPOSE      = docker compose
COMPOSE_DEV  = $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml
COMPOSE_TEST = $(COMPOSE) -f docker-compose.test.yml

# User of the make dev and make test containers (#236): root with rootless Docker
# (the campus), where node cannot enter the mounted ./web; empty otherwise, so the
# compose files keep node. Set it by hand to override: DEV_CONTAINER_USER=root make dev
# Asked once per make run (:=); a value already in the environment is kept
ifndef DEV_CONTAINER_USER
DEV_CONTAINER_USER := $(shell sh scripts/container-user.sh)
endif
export DEV_CONTAINER_USER

# Run when the start fails: shows the last lines of migrate, where the reason is
# (it never prints a password), and explains it if Postgres rejected the password
START_FAILED_HINT = echo "--- Last lines of migrate:"; $(COMPOSE) logs --no-log-prefix --tail 15 migrate 2>/dev/null; \
	$(COMPOSE) logs migrate 2>/dev/null | sh scripts/db-password-hint.sh

# Production: build the images and start everything in the background
# If the app container is still the make dev one, remove it with --volumes first:
# its anonymous node_modules volume would otherwise stay orphaned (~880 MB each
# time, #65). Only then, so a second make with no changes restarts nothing.
# The make dev container is the one that mounts /app/node_modules: its image name
# is not enough, it turns into sha256:... once make test rebuilds that image.
# The address asks compose for the host port nginx really publishes (8443 inside
# the container, see docker-compose.yml): it already applied the quotes, comments
# and shell variables of HTTPS_PORT. 8443 if it cannot tell.
# Then the initial Admin (#213): its email and where its password is, never which.
# The email comes from compose too, for the same reason as the port.
all: env
	@id=$$($(COMPOSE) ps --all -q app 2>/dev/null); \
	if [ -n "$$id" ] && docker inspect --format '{{range .Mounts}}{{.Destination}} {{end}}' $$id | grep -q '/app/node_modules'; then \
		$(COMPOSE) rm --stop --force --volumes app; \
	fi
	$(COMPOSE) up --build -d || { $(START_FAILED_HINT); exit 1; }
	@port=$$($(COMPOSE) port nginx 8443 2>/dev/null | head -n1 | sed 's/.*://'); \
	[ -n "$$port" ] || port=8443; \
	echo "App: https://localhost:$$port (from another computer: https://<this computer's IP>:$$port)"
	@email=$$($(COMPOSE) config 2>/dev/null | sed -n 's/^ *ADMIN_EMAIL: *//p' | head -n1); \
	echo "Admin: $${email:-see ADMIN_EMAIL in .env} (password: ADMIN_PASSWORD in .env). Demo data: make seed"

# Development: hot reload without rebuilding (make logs to see the output)
# Removing the old app container with its anonymous node_modules volume gives
# a fresh install every time (new dependencies) without leaving orphan volumes
dev: env
	$(COMPOSE_DEV) rm --stop --force --volumes app
	$(COMPOSE_DEV) up --build -d || { $(START_FAILED_HINT); exit 1; }

# Load the demo data (demo users, Club Demo and its sessions) with the app in make
# mode (#213); make dev loads it by itself at start. It runs in the migrate container,
# which has the app code, and starts the database if it is not up. It applies the
# migrations first (nothing to do if they are applied), so it also works before the
# first make. Safe to run twice: nothing is duplicated. It says where the password
# is, never which (AGENTS.md).
seed: env
	$(COMPOSE) run --rm --build migrate sh -c "npx prisma migrate deploy && npx prisma db seed"
	@echo "Demo users: see README (password: SEED_USER_PASSWORD in .env)"

# Create .env or add the variables it is missing, and generate the secrets if empty.
# Runs every time (not only when .env is missing) so new variables reach everyone.
env:
	sh scripts/env-sync.sh

# Check that the three compose setups parse (the CI runs this too)
check-compose: env
	$(COMPOSE) config --quiet
	$(COMPOSE_DEV) config --quiet
	$(COMPOSE_TEST) config --quiet

# Run every test (normal and *.db.test.ts) in Docker against an empty test
# database (docker-compose.test.yml, #83). The EXIT trap removes db-test and test
# whatever happens (tests fail, Ctrl+C), and make exits with the tests' result;
# Ctrl+C only has to exit, then the EXIT trap cleans up once.
# --volumes only removes this project's anonymous volumes (the database is in
# memory): never pgdata. Safe with make dev running: it is another compose project.
test: env
	trap '$(COMPOSE_TEST) down --volumes --remove-orphans' EXIT; trap 'exit 130' INT TERM; \
	$(COMPOSE_TEST) run --build --rm test

# Check that nginx is the only way in, over HTTPS. Needs make or make dev running.
test-nginx:
	sh scripts/nginx.test.sh

# Create a migration from the changes in web/prisma/schema.prisma and apply it.
# Needs make dev running (the app container has the Prisma CLI and ./web mounted,
# so the new file lands in web/prisma/migrations/). Usage: make migrate name=add_users
# Prisma 7 no longer regenerates the client after migrate dev, so we do it here.
# WARNING: if migrate dev finds the database out of step with the migrations,
# it offers to RESET it (all data lost). Answer "n" unless losing the data is fine.
migrate:
	$(COMPOSE_DEV) exec app npx prisma migrate dev $(if $(name),--name $(name))
	$(COMPOSE_DEV) exec app npx prisma generate

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

# Stop and remove the containers (database data is kept)
# app is removed first with --volumes so its anonymous volume does not stay orphaned
down:
	$(COMPOSE) rm --stop --force --volumes app
	$(COMPOSE) down

clean: down

# Also remove the volumes and the images: DELETES THE DATABASE DATA
# Then the dangling images of this project (#236): old versions that lost their name
# when an image was rebuilt (1.5 GB each on the campus). Only those with the compose
# label of this project (name: in docker-compose.yml and docker-compose.test.yml).
# That name is fixed, so it is the same in every clone: the old versions from every clone go too.
# --rmi local skips images with a fixed name, so the make dev / make test image
# (transcendence-app-dev) is removed by name (#65). It is checked first so a
# missing image prints nothing, while real errors still show.
fclean:
	$(COMPOSE) down --volumes --rmi local
	@for project in transcendence transcendence-test; do \
		docker image prune --force --filter "label=com.docker.compose.project=$$project" >/dev/null; \
	done
	@if docker image inspect transcendence-app-dev >/dev/null 2>&1; then \
		docker image rm --force transcendence-app-dev; \
	fi

# Sequential on purpose: with make -j, "re: clean all" could run both at once
re: clean
	$(MAKE) all

.PHONY: all dev seed env check-compose test test-nginx migrate down logs ps clean fclean re
