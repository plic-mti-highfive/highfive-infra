#!/usr/bin/env bash
# Reproduit la CI e2e en local, sur une stack JETABLE :
#  - projet compose unique (hf-e2e-<alea>) -> jamais la stack "infra" en cours ;
#  - ports hote libres choisis au hasard (gateway, db, minio) ;
#  - images taguees avec le nom du projet (aucun retag des images ghcr existantes) ;
#  - nettoyage (conteneurs, volumes, orphelins, images du run) via trap, meme en echec.
#
# Depots sources : REPOS_DIR (defaut : dossier parent de highfive-infra), puis
# surcharge par depot via FRONTEND_DIR / CORE_DIR / CANVAS_DIR / AI_DIR
# (chemins relatifs a REPOS_DIR, comme dans docker-compose.yml).
# Usage : scripts/e2e-local.sh [args playwright]   |   make e2e-ci
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export REPOS_DIR="${REPOS_DIR:-$(cd "$INFRA_DIR/.." && pwd)}"
PROJECT="hf-e2e-$(head -c 6 /dev/urandom | od -An -tx1 | tr -d ' \n')"

free_port() {
  python3 -c 'import socket
s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()'
}
GATEWAY_PORT="$(free_port)"; DB_HOST_PORT="$(free_port)"
MINIO_HOST_PORT="$(free_port)"; MINIO_CONSOLE_PORT="$(free_port)"

ENV_FILE="$(mktemp)"
{
  cat "$INFRA_DIR/.env.example"
  echo "REPOS_DIR=$REPOS_DIR"
  [ -n "${FRONTEND_DIR:-}" ] && echo "FRONTEND_DIR=$FRONTEND_DIR"
  [ -n "${CORE_DIR:-}" ] && echo "CORE_DIR=$CORE_DIR"
  [ -n "${CANVAS_DIR:-}" ] && echo "CANVAS_DIR=$CANVAS_DIR"
  [ -n "${AI_DIR:-}" ] && echo "AI_DIR=$AI_DIR"
  echo "LLM_PROVIDER=fake"
  echo "POSTGRES_USER=postgresadmin"
  echo "POSTGRES_PASSWORD=postgresadmin"
  echo "GATEWAY_PORT=$GATEWAY_PORT"
  echo "DB_HOST_PORT=$DB_HOST_PORT"
  echo "MINIO_HOST_PORT=$MINIO_HOST_PORT"
  echo "MINIO_CONSOLE_PORT=$MINIO_CONSOLE_PORT"
  # Tags d'images propres au run : on ne retague pas les images ghcr locales.
  echo "FRONTEND_VERSION=$PROJECT"
  echo "CORE_VERSION=$PROJECT"
  echo "CANVAS_VERSION=$PROJECT"
  echo "AI_VERSION=$PROJECT"
} > "$ENV_FILE"

export COMPOSE_PROJECT_NAME="$PROJECT"
compose() { docker compose --env-file "$ENV_FILE" -f "$INFRA_DIR/docker-compose.yml" --profile seed "$@"; }

cleanup() {
  code=$?
  echo ">> Nettoyage du projet $PROJECT"
  compose down -v --remove-orphans || true
  docker images --format '{{.Repository}}:{{.Tag}}' | grep -E ":${PROJECT}\$" | xargs -r docker rmi || true
  rm -f "$ENV_FILE"
  exit "$code"
}
trap cleanup EXIT INT TERM

echo ">> Projet $PROJECT  gateway=:$GATEWAY_PORT db=:$DB_HOST_PORT  repos=$REPOS_DIR"
compose up -d --build --wait
compose up seed

cd "$INFRA_DIR/e2e"
pnpm install --frozen-lockfile
GATEWAY_PORT="$GATEWAY_PORT" DB_HOST_PORT="$DB_HOST_PORT" \
  POSTGRES_USER=postgresadmin POSTGRES_PASSWORD=postgresadmin \
  pnpm test:e2e "$@"
