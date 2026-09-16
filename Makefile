# Highfive — orchestration de la stack complete
#
# Commande unique : `make up` (ou simplement `make`).
# Toutes les cibles utilisent docker-compose.dev.yml, plus besoin de passer -f.

COMPOSE := docker compose -f docker-compose.dev.yml

.DEFAULT_GOAL := up
.PHONY: up down restart logs ps pull build clean reset help

## up : demarre toute la stack et attend que les services soient sains
up: .env
	$(COMPOSE) pull --ignore-buildable || \
		(echo ""; \
		 echo ">> Echec du pull. Les images sont privees sur ghcr.io :"; \
		 echo ">>   echo \$$GITHUB_TOKEN | docker login ghcr.io -u <user> --password-stdin"; \
		 echo ""; \
		 exit 1)
	$(COMPOSE) up -d --wait
	@echo ""
	@echo "Stack demarree. Front : http://localhost:52"
	@$(COMPOSE) ps

## down : arrete la stack (les volumes sont conserves)
down:
	$(COMPOSE) down

## restart : redemarre la stack
restart: down up

## logs : suit les logs de tous les services (make logs S=backend_core pour un seul)
logs:
	$(COMPOSE) logs -f $(S)

## ps : etat des services
ps:
	$(COMPOSE) ps

## pull : recupere les dernieres images sans redemarrer
pull:
	$(COMPOSE) pull

## clean : arrete la stack et supprime les conteneurs orphelins
clean:
	$(COMPOSE) down --remove-orphans

## reset : arrete tout et SUPPRIME les volumes (db, redis, minio) — destructif
reset:
	@printf "Supprimer les volumes pgdata/redisdata/miniodata ? [y/N] " && read ans && [ "$$ans" = "y" ]
	$(COMPOSE) down -v --remove-orphans

# Cree le .env au premier lancement a partir du modele.
.env:
	@cp .env.exemple .env
	@echo ">> .env cree depuis .env.exemple — renseigne OPENAI_API_KEY avant de continuer."
	@exit 1

## help : liste les cibles disponibles
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /'
