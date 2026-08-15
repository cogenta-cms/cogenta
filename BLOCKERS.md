# Blocages — L13, tranche « duplication / autosave / réinitialisation »

Ce fichier ne liste que ce qui est réellement bloqué, pas ce qui est fait.

## 1. Intégration Postgres / MySQL / MariaDB non exécutée (environnement)

**Ce qui manque** : la case « Tests d'intégration sur les trois bases » de la
définition de terminé, pour les deux surfaces de données ajoutées ici
(`ContentStore.duplicate` et `PasswordResetStore`).

**Pourquoi** : le moteur Docker de cette machine répond `500 Internal Server
Error` à tout appel d'API (`docker ps`, `docker compose ... up`), donc
`pnpm services:up` échoue avant de démarrer quoi que ce soit. Ce n'est pas
une régression du dépôt : le même constat est déjà consigné dans `CLAUDE.md`
pour l'intégration `MediaStore`.

```
unable to get image 'postgres:17-alpine': request returned 500 Internal Server
Error for API route and version .../v1.51/images/postgres:17-alpine/json
```

**Ce qui a quand même été fait** : les tests *sont écrits* et rejoués sur les
quatre dialectes par construction, pas seulement sur SQLite.

- `duplicate()` : les douze tests vivent dans la suite de contrat unique
  `packages/schema/test/store/content-store.contract.ts`, que
  `test/integration/content-store.test.ts` exécute déjà contre Postgres, MySQL
  et MariaDB.
- `PasswordResetStore` : nouvelle suite de contrat
  `packages/auth/test/resets.contract.ts`, plus un nouveau
  `packages/auth/test/integration/resets.test.ts` — c'est le **premier**
  répertoire `test/integration/` de `@cogenta/auth`, qui n'en avait aucun
  jusqu'ici alors que `vitest.integration.config.ts` en attendait un.

Les deux fichiers d'intégration sautent **bruyamment** (un `describe.skip`
nommant la variable d'environnement manquante), jamais silencieusement. Il
n'y a donc rien à écrire pour lever ce blocage : il suffit de le rejouer sur
une machine où Docker fonctionne.

```bash
pnpm services:up
pnpm -F @cogenta/schema test:integration
pnpm -F @cogenta/auth   test:integration
```

Le point le plus sensible à vérifier là-bas est l'unicité d'usage du jeton de
réinitialisation : elle repose sur `update ... where used_at is null` et sur
la valeur de `rowsAffected`, et MySQL a historiquement sa propre définition de
« ligne affectée ».

## 2. Ce qui n'est **pas** un blocage, et pourquoi

- **Taxonomies et corbeille** : non codées, délibérément. Elles dépendent de
  l'ADR proposée dans `ADR-DRAFT-contrat-A-v2.md`, qui n'est pas actée — le
  contrat A reste figé en `schema@1.0`. Rien à débloquer côté code tant qu'un
  humain n'a pas tranché.
- **Absence de transport SMTP réel** : `cogenta users reset-password` écrit un
  vrai message dans `.cogenta/mail` via le transport fichier de
  `@cogenta/channels`, et le dit explicitement dans sa sortie. C'est un manque
  déjà documenté dans `packages/channels/src/providers/email/transport.ts`, pas
  un blocage introduit ici.
- **Absence de route admin de réinitialisation** : le lot L13 demande
  explicitement « CLI d'abord, puis admin une fois L11 avancé ». Le message
  envoyé porte donc le jeton et la commande exacte, jamais un lien qui
  renverrait un 404 aujourd'hui.
