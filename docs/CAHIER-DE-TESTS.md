# Cahier de tests e2e — HighFive!

## Rôle

Les tests end-to-end (`e2e/`, Playwright) vérifient la plateforme **assemblée** :
gateway NGINX, frontend, core, canvas (Hocuspocus), service IA, Postgres, Redis,
MinIO. Ils détectent ce que les tests unitaires de chaque dépôt ne voient pas :
routage de la gateway, contrats inter-services, câblage compose, persistance réelle.
Le LLM est en mode `LLM_PROVIDER=fake` (réponse déterministe `[assistant simule]`, sans réseau).

## Lancer les tests

- **Local, stack jetable** : `make e2e-ci` (= `scripts/e2e-local.sh`). Projet compose
  `hf-e2e-<aléa>`, ports libres, build depuis `REPOS_DIR` (défaut : dossier parent),
  seed, Playwright, puis `down -v --remove-orphans` et suppression des images du
  run (trap, même en échec). Ne touche pas la stack de dev en cours.
- **Local, stack déjà démarrée** : `docker compose up -d --build --wait &&
  docker compose --profile seed up seed`, puis `make e2e`.
- **CI** : `.github/workflows/e2e.yml`, workflow réutilisable appelé par les 5
  dépôts à chaque push (merge) sur `main` ; aussi `workflow_dispatch`. Voir le
  README, section « CI e2e ».

## Stratégie de stack jetable

Chaque run crée sa propre stack : `COMPOSE_PROJECT_NAME` unique (`e2e-<run_id>-<attempt>`
en CI, `hf-e2e-<aléa>` en local), volumes propres (db, redis, minio), puis
`down -v --remove-orphans` en `always()`. Aucune donnée ni collision entre runs ;
les tests partent d'une base seedée (compte `alex.rivera@example.com`) et créent
leurs propres projets (titres horodatés). Un seul worker Playwright (état partagé).

## Scénarios

| ID | Scénario | Services traversés | Fichier | Statut |
| --- | --- | --- | --- | --- |
| E2E-CONN-01 | Gateway répond (`/nginx-health`) | gateway | `e2e/tests/connectivity.spec.ts` | ✅ existant |
| E2E-CONN-02 | Frontend servi par la gateway | gateway, frontend | `e2e/tests/connectivity.spec.ts` | ✅ existant |
| E2E-CONN-03 | Core `/api/health` | gateway, core | `e2e/tests/connectivity.spec.ts` | ✅ existant |
| E2E-CONN-04 | Core `/api/health/ready` (db, redis, minio) | gateway, core, Postgres, Redis, MinIO | `e2e/tests/connectivity.spec.ts` | ✅ existant |
| E2E-CONN-05 | Canvas `/ws/health` | gateway, canvas | `e2e/tests/connectivity.spec.ts` | ✅ existant |
| E2E-CONN-06 | Service IA `/ai/api/v1/livez` | gateway, backend-ai | `e2e/tests/connectivity.spec.ts` | ✅ existant |
| E2E-CONN-07 | Login du compte seed (core -> base) | gateway, core, Postgres | `e2e/tests/connectivity.spec.ts` | ✅ existant |
| E2E-CHAT-01 | Parcours chat du Mur : `@ia` répond (contexte croissant), sauvegarde Yjs vérifiée par 2e client et par SQL | gateway, core, canvas, Redis/BullMQ, MinIO, Postgres | `e2e/tests/wall-chat.spec.ts` | ✅ existant |
| E2E-CHAT-02 | Le Mur refuse un client sans jeton valide | gateway, canvas | `e2e/tests/wall-chat.spec.ts` | ✅ existant |
| E2E-SYNC-01 | Post-it créé dans un navigateur visible dans l'autre, persisté ; suggestion de tâches IA sans clé = 503 français | frontend, gateway, core, canvas, MinIO | `e2e/tests/wall-sync-ui.spec.ts` | ✅ existant |
| E2E-CI-01 | Exécution automatique à chaque merge sur `main` de chaque dépôt, stack jetable | tous | `.github/workflows/e2e.yml` | 🆕 ajouté T10 |
| E2E-CI-02 | Reproduction locale jetable (`make e2e-ci`) | tous | `scripts/e2e-local.sh` | 🆕 ajouté T10 |

## Parcours critiques non couverts / à faire

- Inscription -> création de projet -> candidature -> acceptation, **via l'UI**
  (ni API ni UI aujourd'hui en e2e).
- Accès au Mur selon le rôle (membre accepté vs candidat refusé, lecture seule).
- Messagerie (`/conversations`, `/messages`) de bout en bout.
- Recommandations IA avec embeddings réels (worker IA) ; ici seul `/livez` est testé.
- Upload de fichiers (MinIO) via le front.
- Déconnexion / expiration de session, réinitialisation de mot de passe.
- Charge et reprise après redémarrage d'un service.
