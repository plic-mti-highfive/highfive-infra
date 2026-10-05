# Highfive — orchestration de la stack complete
#
# Commande unique : `make up` (ou simplement `make`).
# Toutes les cibles utilisent docker-compose.yml, plus besoin de passer -f.

COMPOSE := docker compose -f docker-compose.yml
COMPOSE_LOCAL := $(COMPOSE) -f docker-compose.local.yml

# Emplacement des depots voisins (surchargeable dans .env).
REPOS_DIR ?= ..
LOCAL_REPOS := $(REPOS_DIR)/highfive-frontend $(REPOS_DIR)/core_backend \
               $(REPOS_DIR)/highfive-backend-canvas $(REPOS_DIR)/highfive-backend-ai

.DEFAULT_GOAL := up
.PHONY: build up local local-down local-logs local-ps down restart logs ps pull clean reset help check-repos e2e

## up : demarre toute la stack et attend que les services soient sains
up: .env
	$(COMPOSE) pull || \
		(echo ""; \
		 echo ">> Echec du pull. Les images sont privees sur ghcr.io :"; \
		 echo ">>   echo \$$GITHUB_TOKEN | docker login ghcr.io -u <user> --password-stdin"; \
		 echo ""; \
		 exit 1)
	$(COMPOSE) up -d --no-build --wait
	@$(COMPOSE) restart gateway
	$(COMPOSE) --profile seed up --no-build seed
	@echo ""
	@echo "Stack demarree. Front : http://localhost:52"
	@$(COMPOSE) ps

## build : construit toutes les images depuis les depots voisins puis demarre (docker compose up -d --build --wait)
build: .env check-repos
	$(COMPOSE) up -d --build --wait

## e2e : lance les tests Playwright (connectivite + chat du Mur) contre la stack deja demarree
e2e: .env
	cd e2e && pnpm install --frozen-lockfile && set -a && . ../.env && set +a && pnpm test:e2e

## local : construit et demarre la stack depuis les depots clones localement
local: .env check-repos
	$(COMPOSE_LOCAL) build
	$(COMPOSE_LOCAL) up -d --wait
	@$(COMPOSE_LOCAL) restart gateway
	$(COMPOSE_LOCAL) --profile seed up seed
	@echo ""
	@echo "Stack locale demarree. Front : http://localhost:$${GATEWAY_PORT:-52}"
	@$(COMPOSE_LOCAL) ps

## local-logs : logs de la stack locale (make local-logs S=backend_core)
local-logs:
	$(COMPOSE_LOCAL) logs -f $(S)

## local-ps : etat de la stack locale
local-ps:
	$(COMPOSE_LOCAL) ps

## local-down : arrete la stack locale
local-down:
	$(COMPOSE_LOCAL) --profile seed down

# Verifie que les depots voisins sont bien clones avant de lancer un build.
check-repos:
	@missing=""; \
	for r in $(LOCAL_REPOS); do \
		[ -d "$$r" ] || missing="$$missing $$r"; \
	done; \
	if [ -n "$$missing" ]; then \
		echo ">> Depots introuvables :$$missing"; \
		echo ">> Clone-les a cote de highfive-infra, ou definis REPOS_DIR dans .env."; \
		exit 1; \
	fi

## down : arrete la stack (les volumes sont conserves)
down:
	$(COMPOSE) --profile seed down

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
	$(COMPOSE) --profile seed down --remove-orphans

## reset : arrete tout et SUPPRIME les volumes (db, redis, minio) — destructif
reset:
	@printf "Supprimer les volumes pgdata/redisdata/miniodata ? [y/N] " && read ans && [ "$$ans" = "y" ]
	$(COMPOSE) --profile seed down -v --remove-orphans

# Cree le .env au premier lancement a partir du modele.
.env:
	@cp .env.example .env
	@echo ">> .env cree depuis .env.example — renseigne OPENAI_API_KEY avant de continuer."
	@exit 1

## help : liste les cibles disponibles
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  /'
