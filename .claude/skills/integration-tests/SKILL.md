---
name: integration-tests
description: Use when writing or running Cogenta integration tests against real Postgres, MySQL/MariaDB, SQLite, Redis or MinIO — covers starting the ephemeral services, the no-mocks rule, per-test isolation, and how absent services must be skipped rather than silently passed.
---

# Tests d'intégration

**Règle AGENTS.md : pas de mock de la base. Base réelle éphémère.** Un mock de base
teste le mock, pas le code — et les trois dialectes divergent précisément là où les
mocks sont d'accord.

## Démarrer les services

```bash
pnpm services:up      # Postgres, MySQL, MariaDB, Redis, MinIO (docker compose --wait)
pnpm test:integration
pnpm services:down    # -v : supprime aussi les volumes
```

SQLite n'a besoin de rien : fichier temporaire, mode WAL activé.

Les URL de connexion viennent de l'environnement, avec les valeurs par défaut de
`docker-compose.test.yml`. En CI, ce sont les `services:` du workflow.

## Isolation entre tests

Chaque test part d'un état propre, sans dépendre de l'ordre d'exécution :

- **Postgres** — un schéma par worker de test (`CREATE SCHEMA test_<id>`), `search_path`
  positionné, `DROP SCHEMA … CASCADE` à la fin. Plus rapide qu'une base par test.
- **MySQL/MariaDB** — une base par worker. Pas de DDL transactionnel : ne compte pas sur
  un rollback pour nettoyer.
- **SQLite** — un fichier temporaire par test, `journal_mode = WAL`, `busy_timeout`.

Ne nettoie pas avec un `TRUNCATE` global partagé : les tests parallèles se marchent
dessus et l'échec est intermittent, donc coûteux à diagnostiquer.

## Service absent : skip explicite, jamais succès silencieux

```ts
const pg = process.env.COGENTA_TEST_POSTGRES_URL
describe.skipIf(!pg)('postgres', () => { /* … */ })
```

Et le rapport de test doit **dire** ce qui a été sauté. Un driver non testé qui compte
comme vert est la façon la plus efficace de livrer un driver cassé.

## Ce qu'un test d'intégration doit couvrir

- **La même suite sur les trois dialectes** (critère de sortie de L0).
- **La concurrence**, quand le code prend un verrou : N workers réels en parallèle, pas
  un `Promise.all` sur des appels séquentiels déguisés.
- **Le driver dégradé autant que l'optimal.**
- **Les permissions par rôle** dès qu'une route ou un outil est exposé — y compris le
  cas du refus, qui est celui qu'on oublie.
- **Aucun secret dans les logs**, vérifié par test (critère d'acceptation de L0).

## Nommage

Le nom du test décrit le **comportement attendu**, pas la fonction appelée.

```ts
// Non : it('calls enqueue')
it('ne traite jamais le même job depuis deux workers concurrents', …)
```

## Performance

Un test d'intégration lent est un test qu'on finit par désactiver. Réutilise les
connexions, crée le schéma une fois par worker, et garde les données de test minimales.
