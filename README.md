# 🚀 Highfive Infrastructure

Infrastructure et configuration Docker Compose pour le déploiement local et développement du projet Highfive.

## 📋 Vue d'ensemble

Ce projet orchestrate tous les services nécessaires pour faire fonctionner la plateforme Highfive :

- **Frontend** : Interface utilisateur (React/Vite)
- **Backend Core** : API principale (NestJS)
- **Backend Canvas** : Service canvas en temps réel (WebSocket)
- **Backend AI** : Service d'intelligence artificielle (Python)
- **Database** : PostgreSQL avec pgvector
- **Cache** : Redis + BullMQ
- **Storage** : MinIO (compatible S3)
- **Gateway** : NGINX (reverse proxy)

## 🛠️ Prérequis

- Docker avec le plugin Compose v2 (`docker compose version`)
- Git, et les 4 dépôts applicatifs clonés à côté de `highfive-infra` (voir
  [Démarrer depuis les dépôts locaux](#démarrer-depuis-les-dépôts-locaux))
- Un minimum de 4GB de RAM disponible
- Node.js + pnpm, uniquement pour les tests e2e

## ⚡ Lancer la stack (pas à pas)

### 1. Cloner les dépôts

```bash
mkdir plic-repos && cd plic-repos
for r in highfive-infra highfive-frontend highfive-backend-canvas highfive-backend-ai; do
  git clone git@github.com:plic-mti-highfive/$r.git
done
git clone git@github.com:plic-mti-highfive/highfive-backend-core.git core_backend
cd highfive-infra
```

Le core doit être cloné dans `core_backend/`, nom attendu par le compose.
Sinon, renseigne `CORE_DIR` dans `.env`.

### 2. Créer le `.env`

```bash
cp .env.example .env
```

Les valeurs par défaut suffisent pour un lancement local **sans clé OpenAI**
(`LLM_PROVIDER=fake`). Pour activer la vraie IA, voir l'étape 3. Le `.env` est
ignoré par git : n'y commite jamais de clé.

### 3. (Optionnel) Clé OpenAI

Une seule clé, dans le `.env` de l'infra, alimente tous les services :

```env
OPENAI_API_KEY=sk-...        # https://platform.openai.com/api-keys
OPENAI_MODEL=gpt-4o-mini     # modèle utilisé par le core
LLM_PROVIDER=openai          # assistant @ia du Mur : fake | openai
```

| Service | Variable reçue | Usage | Sans clé |
|---------|----------------|-------|----------|
| `backend_core` | `OPENAI_TOKEN` (= `OPENAI_API_KEY`) | assistant `@ia` du chat du Mur (si `LLM_PROVIDER=openai`), génération de tâches depuis le Mur | `@ia` répond `[assistant simule] ...` avec `fake` ; avec `openai` sans clé, message d'erreur en français dans le chat. Génération de tâches : erreur 503 « La generation de taches n'est pas configuree sur ce serveur. » |
| `backend_ai_api`, `backend_ai_worker` | `OPENAI_API_KEY` | embeddings et recommandations | le worker échoue sur ses jobs (401) ; le core se rabat sur ses règles déterministes, l'application reste utilisable |

`LLM_PROVIDER=fake` donne une réponse déterministe, sans réseau. Garde-le pour
la CI et les e2e : les tests attendent la réponse `[assistant simule]`.

Après un changement de clé ou de provider, inutile de reconstruire les images :
`docker compose up -d` recrée les services concernés. Pour vérifier :

```bash
docker compose exec backend_core printenv LLM_PROVIDER
```

### 4. Démarrer

Depuis les dépôts locaux (code à jour, **recommandé**) :

```bash
docker compose up -d --build --wait      # ou : make build
docker compose --profile seed up seed    # données de démo (une fois)
```

Ou bien depuis les images publiées sur ghcr.io (`make up`, voir plus bas). Ces
images sont épinglées dans `.env.example` sur des versions antérieures au
sprint : elles n'ont ni l'assistant `@ia` ni la messagerie.

Le premier build prend quelques minutes. `--wait` rend la main quand tous les
services sont *healthy* (`backend_ai_migrate` s'arrête normalement en
`Exited (0)` : il applique les migrations du service IA).

### 5. Vérifier et se connecter

```bash
docker compose ps                         # tout doit être "healthy"
curl http://localhost:52/api/health       # API core
curl http://localhost:52/api/health/ready # core + db, redis, minio
```

Front : http://localhost:52. Compte de démo créé par le seed :
`alex.rivera@example.com` / `demo1234`. Pour avoir un compte administrateur,
mets son e-mail dans `ADMIN_EMAILS` (liste séparée par des virgules), puis
lance `docker compose up -d`.

Test de bout en bout (optionnel) : `make e2e` (voir [Tests e2e](#tests-e2e-playwright)).

### 6. Arrêter

```bash
docker compose --profile seed down      # garde les données
docker compose --profile seed down -v   # supprime aussi db, redis, minio
```

## 🚀 Démarrage avec les images ghcr.io

Une seule commande démarre toute la stack :

```bash
make up
```

`make up` (ou simplement `make`) crée le `.env` si besoin, récupère les images
depuis ghcr.io, lance les services et attend qu'ils soient tous *healthy*.

Les versions v2 publiées sont épinglées dans `.env.example` : front `2.0.1`,
core `2.0.1`, canvas `2.0.0`, IA `2.1.1`.

### Point d'entrée : `docker-compose.yml`

`docker-compose.yml` décrit toute la stack (gateway, frontend, core, canvas,
IA api + worker, Postgres/pgvector, Redis, MinIO, seed). Chaque service a une
section `build` pointant vers le dépôt voisin, donc :

```bash
docker compose up -d --build --wait   # ou : make build
```

construit tout depuis les clones locaux ; `make up` tire les images ghcr.io.
Tous les services ont un healthcheck et les `depends_on` utilisent
`service_healthy`. Le réseau interne est propre au projet compose (`<projet>_default`). `LLM_PROVIDER`
vaut `fake` par défaut (voir `.env.example`).

### Démarrer depuis les dépôts locaux

Pour tester tes modifications non publiées, `make local` construit chaque
service depuis le clone local du dépôt voisin au lieu de tirer l'image ghcr.io :

```bash
make local
```

Les dépôts sont attendus à côté de `highfive-infra` :

```
plic-repos/
├── highfive-infra/
├── highfive-frontend/
├── core_backend/
├── highfive-backend-canvas/
└── highfive-backend-ai/
```

Si tes clones sont ailleurs, définis `REPOS_DIR` dans `.env` (ou
`FRONTEND_DIR`, `CORE_DIR`, `CANVAS_DIR`, `AI_DIR` pour un dossier renommé).
`make local` échoue avec un message explicite si un dépôt manque.

```bash
make local-ps                  # etat de la stack locale
make local-logs S=backend_core # logs d'un service
make local-down                # arret
```

En mode local, le backend core est aussi exposé en direct sur
`http://localhost:3000` (`CORE_HOST_PORT`), pour déboguer l'API sans passer par
la gateway.

### Autres commandes

```bash
make ps                  # etat des services
make logs                # logs de tous les services
make logs S=backend_core # logs d'un seul service
make pull                # recupere les dernieres images
make restart             # redemarre la stack
make down                # arrete la stack (volumes conserves)
make reset               # arrete et SUPPRIME les volumes (destructif, demande confirmation)
make help                # liste les cibles
```

Les images sont privées sur ghcr.io, un login est nécessaire une fois :

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u <user> --password-stdin
```

### Conflits de ports

Si un autre projet occupe déjà un port, il suffit de le changer dans `.env` —
aucune modification du compose n'est nécessaire :

```env
GATEWAY_PORT=52
DB_HOST_PORT=5432
MINIO_HOST_PORT=9000
MINIO_CONSOLE_PORT=9001
```

## 📍 Accès aux services

Une fois démarrés, les services sont accessible via :

| Service | URL par défaut | Variable |
|---------|----------------|----------|
| **Frontend** | http://localhost:52 | `GATEWAY_PORT` |
| **API Core** | http://localhost:52/api | via NGINX |
| **API AI** | http://localhost:52/ai | via NGINX |
| **WebSocket Canvas** | ws://localhost:52/ws | via NGINX |
| **PostgreSQL** | localhost:5432 | `DB_HOST_PORT` |
| **MinIO API** | http://localhost:9000 | `MINIO_HOST_PORT` |
| **MinIO Console** | http://localhost:9001 | `MINIO_CONSOLE_PORT` |
| **API Core (direct)** | http://localhost:3000 | `CORE_HOST_PORT`, `make local` uniquement |

Redis n'est pas publié sur l'hôte : il n'est joignable que depuis le réseau
Docker, sous le nom `redis`.

## Tests e2e (Playwright)

`e2e/` contient les tests inter-services (connectivite de chaque service via la
gateway, parcours chat du Mur : `@ia` -> réponse du provider `fake` -> sauvegarde
Yjs et messages de la conversation `wall`). Ils tournent au niveau API/WebSocket : le
front ne branche pas encore le Mur, pas besoin de navigateur.

```bash
docker compose up -d --build --wait && docker compose --profile seed up seed
make e2e                         # = cd e2e && pnpm install && pnpm test:e2e
```

URLs surchargeables : `E2E_GATEWAY_URL` (défaut `http://localhost:$GATEWAY_PORT`),
`E2E_FRONTEND_URL`, `E2E_API_URL`, `E2E_AI_URL`, `E2E_CANVAS_URL`,
`E2E_CANVAS_WS_URL` ; Postgres (`DB_HOST_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`).
En CI : `.github/workflows/e2e.yml` (secret `REPOS_TOKEN` pour cloner les dépôts voisins).

## 🏗️ Architecture des services

### Gateway (NGINX)

Reverse proxy responsable du routage :
- `/api/*` → Backend Core (port 3000), préfixe `/api` conservé
- `/ai/*` → Backend AI (port 8000)
- `/ws/*` → Backend Canvas (port 8585)

### Backend Core

Services principaux via API REST :
- Authentification & autorisation (JWT)
- Gestion des projets
- Gestion des utilisateurs

**Accès** : http://localhost:52/api/docs (Swagger UI)

### Backend Canvas

Service WebSocket pour les mises à jour en temps réel :
- Communication bidirectionnelle
- Synchronisation collaborative
- File d'attente BullMQ (Redis)

### Backend AI

Service d'intelligence artificielle :
- Endpoints spécialisés IA
- Connexion à PostgreSQL
- Stockage vectoriel (pgvector)

**Accès** : http://localhost:52/ai/docs (Swagger UI)

### Database PostgreSQL

- **Image** : pgvector/pgvector:pg16
- **Extension** : pgvector pour embeddings
- **Données persistantes** : volume `pgdata`

### Redis

- **Cache** & session store
- **BullMQ** pour les files d'attente
- **Données persistantes** : volume `redisdata`

### MinIO

Stockage compatible S3 pour les fichiers :
- **API** : http://localhost:9000
- **Console** : http://localhost:9001
- **Données persistantes** : volume `miniodata`

## 📦 Volumes persistants

Les données sont sauvegardées dans des volumes Docker :

```
pgdata       → Base de données PostgreSQL
redisdata    → Cache Redis
miniodata    → Fichiers MinIO
```

Pour nettoyer les volumes (⚠️ destructif) :

```bash
make reset
```

## 🔧 Dépannage

### Les services ne démarrent pas

```bash
# Vérifier les logs
make logs

# Vérifier les ressources disponibles
docker stats
```

### Connection refused à la base de données

```bash
# Vérifier que PostgreSQL est healthy
make ps

# Attendre 10-15 secondes après le démarrage
```

### Upload de plus de 1 Mo refusé (413)

La gateway n'a pas de `client_max_body_size` : nginx applique sa limite par
défaut de 1 Mo. Via `http://localhost:52`, un fichier, un avatar ou un média
plus gros reçoit une page HTML `413 Request Entity Too Large`. C'est un bug
connu, pas encore corrigé (il faudra ajouter `client_max_body_size 60m;` dans
`config/default.conf`).

### Port déjà utilisé

```bash
# Identifier le processus utilisant le port
lsof -i :52

# Ou changer le port dans docker-compose.yml
```

---

**Créé par le team Highfive** | Dernière mise à jour : 2026
