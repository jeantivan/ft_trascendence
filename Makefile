COMPOSE     = docker compose
COMPOSE_DEV = $(COMPOSE) -f docker-compose.yml -f docker-compose.dev.yml

# Production: build the images and start everything in the background
all: .env
	$(COMPOSE) up --build -d

# Development: hot reload without rebuilding (make logs to see the output)
dev: .env
	$(COMPOSE_DEV) up --build --renew-anon-volumes -d

# Create .env from the template only if it does not exist yet
.env:
	cp .env.example .env

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

# Stop and remove the containers (database data is kept)
down:
	$(COMPOSE) down

clean: down

# Also remove the volumes and the images: DELETES THE DATABASE DATA
fclean:
	$(COMPOSE) down --volumes --rmi local

re: clean all

.PHONY: all dev down logs ps clean fclean re
