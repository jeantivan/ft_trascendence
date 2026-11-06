COMPOSE     = docker compose
COMPOSE_DEV = $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml

# Run when the start fails: explains it if Postgres rejected the password
DB_PASSWORD_HINT = $(COMPOSE) logs migrate 2>/dev/null | sh scripts/db-password-hint.sh

# Production: build the images and start everything in the background
all: env
	$(COMPOSE) up --build -d || { $(DB_PASSWORD_HINT); exit 1; }

# Development: hot reload without rebuilding (make logs to see the output)
# Removing the old app container with its anonymous node_modules volume gives
# a fresh install every time (new dependencies) without leaving orphan volumes
dev: env
	$(COMPOSE_DEV) rm --stop --force --volumes app
	$(COMPOSE_DEV) up --build -d || { $(DB_PASSWORD_HINT); exit 1; }

# Create .env or add the variables it is missing, and generate the secrets if empty.
# Runs every time (not only when .env is missing) so new variables reach everyone.
env:
	sh scripts/env-sync.sh

# Check that both compose setups parse (the CI runs this too)
check-compose: env
	$(COMPOSE) config --quiet
	$(COMPOSE_DEV) config --quiet

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
fclean:
	$(COMPOSE) down --volumes --rmi local

# Sequential on purpose: with make -j, "re: clean all" could run both at once
re: clean
	$(MAKE) all

.PHONY: all dev env check-compose test-nginx migrate down logs ps clean fclean re
