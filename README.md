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

# Base de données
POSTGRES_USER=admin
POSTGRES_PASSWORD=admin

# MinIO / Storage
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin

# Authentification
JWT_SECRET=clee-super-secret
```

## 🚀 Démarrage

### Démarrer tous les services

```bash
docker compose -f docker-compose.dev.yml up -d
```

### Vérifier le statut

```bash
docker compose -f docker-compose.dev.yml ps
```

### Consulter les logs

```bash
# Tous les services
docker compose -f docker-compose.dev.yml logs -f

# Un service spécifique
docker compose -f docker-compose.dev.yml logs -f backend_core
```

### Arrêter les services

```bash
docker compose -f docker-compose.dev.yml down
```

## 📍 Accès aux services

Une fois démarrés, les services sont accessible via :

| Service | URL | Port |
|---------|-----|------|
| **Frontend** | http://localhost:52 | 52 |
| **API Core** | http://localhost:52/api | 52 (via NGINX) |
| **API AI** | http://localhost:52/ai | 52 (via NGINX) |
| **WebSocket Canvas** | ws://localhost:52/ws | 52 (via NGINX) |
| **PostgreSQL** | localhost:5432 | 5432 |
| **Redis** | localhost:6379 | 6379 |
| **MinIO API** | http://localhost:9000 | 9000 |
| **MinIO Console** | http://localhost:9001 | 9001 |

## 🏗️ Architecture des services

### Gateway (NGINX)

Reverse proxy responsable du routage :
- `/api/*` → Backend Core (port 3000)
- `/ai/*` → Backend AI (port 8000)
- `/ws/*` → Backend Canvas (port 8585)

### Backend Core

Services principaux via API REST :
- Authentification & autorisation (JWT)
- Gestion des projets
- Gestion des utilisateurs

**Accès** : http://localhost:52/api/api/docs (Swagger UI)

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
docker volume rm highfive_pgdata highfive_redisdata highfive_miniodata
```

## 🔧 Dépannage

### Les services ne démarrent pas

```bash
# Vérifier les logs
docker compose -f docker-compose.dev.yml logs

# Vérifier les ressources disponibles
docker stats
```

### Connection refused à la base de données

```bash
# Vérifier que PostgreSQL est healthy
docker compose -f docker-compose.dev.yml ps db

# Attendre 10-15 secondes après le démarrage
```

### Port déjà utilisé

```bash
# Identifier le processus utilisant le port
lsof -i :52

# Ou changer le port dans docker-compose.dev.yml
```

## 📝 Scripts

Le dossier `scripts/` contient des utilitaires pour faciliter le développement.

## 🔐 Sécurité

⚠️ **Les identifiants par défaut sont destinés au développement uniquement.**

Pour la production :
- Changer tous les secrets (`JWT_SECRET`, mots de passe, etc.)
- Utiliser des secrets Docker/Kubernetes
- Activer HTTPS (décommenter port 443)
- Configurer les pare-feu et CORS appropriés

## 📚 Documentation additionnelle

- [Frontend](../highfive-frontend/README.md)
- [Backend Core](../highfive-backend-core/README.md)
- [Backend Canvas](../highfive-backend-canvas/README.md)
- [Backend AI](../highfive-backend-ai/README.md)
- [Shared Types](../highfive-shared-types/README.md)

## 📄 Changelog

Voir [CHANGELOG.md](CHANGELOG.md)

---

**Créé par le team Highfive** | Dernière mise à jour : 2026
