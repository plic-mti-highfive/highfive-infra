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

- Docker & Docker Compose
- Git (pour cloner le projet)
- Un minimum de 4GB de RAM disponible

## ⚙️ Configuration

### 1. Variables d'environnement

Copier le fichier d'exemple et configurer les variables :

```bash
cp .env.exemple .env
```

Éditer `.env` avec vos paramètres :

```env
# Versions des images
FRONTEND_VERSION=latest
CORE_VERSION=latest
CANVAS_VERSION=latest
AI_VERSION=latest

# DB
POSTGRES_USER=admin
POSTGRES_PASSWORD=admin

# MinIO
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin

# Secrets
JWT_SECRET=clee-super-secret
```

## 🚀 Démarrage

Une seule commande démarre toute la stack :

```bash
make up
```

`make up` (ou simplement `make`) crée le `.env` si besoin, récupère les images
depuis ghcr.io, lance les services et attend qu'ils soient tous *healthy*.

Les versions v2 publiées sont épinglées dans `.env.exemple` : front `2.0.0`,
core `2.0.0`, canvas `2.0.0`, IA `2.1.1`.

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
`http://localhost:3000` (`CORE_HOST_PORT`), car le front est construit avec
`VITE_API_URL=http://localhost:3000` par défaut.

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

### Port déjà utilisé

```bash
# Identifier le processus utilisant le port
lsof -i :52

# Ou changer le port dans docker-compose.dev.yml
```

---

**Créé par le team Highfive** | Dernière mise à jour : 2026
