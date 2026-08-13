# L0 — Socle

## Objectif

Poser les fondations sur lesquelles les neuf autres lots reposent : monorepo,
configuration, système de drivers, accès aux données, migrations, tests, CI.

Rien de visible pour l'utilisateur. C'est le lot le plus ingrat et le plus structurant :
tout le reste hérite de ses choix.

## Dépendances

Aucune. C'est le premier lot.

## Périmètre

- Monorepo pnpm + Turborepo + Changesets
- Configuration typée, validée, hiérarchique
- Système de drivers : interface, registre, sélection par environnement
- Drivers de base de données : Postgres, MySQL/MariaDB, SQLite (Drizzle)
- Drivers cache, queue, storage — un optimal et un dégradé chacun
- Moteur de migrations
- Logger structuré
- Erreurs typées
- Harnais de tests : unitaires, intégration sur base réelle, e2e
- CI complète

## Arborescence

```
cogenta/
├── package.json                 # workspace root, private
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .changeset/
├── AGENTS.md
├── docs/
├── packages/
│   ├── core/                    # @cogenta/core
│   │   ├── src/
│   │   │   ├── config/          # chargement, validation, résolution
│   │   │   ├── drivers/         # interfaces + registre + sélection
│   │   │   ├── db/              # Drizzle, dialectes, migrations
│   │   │   ├── cache/
│   │   │   ├── queue/
│   │   │   ├── storage/
│   │   │   ├── errors/
│   │   │   ├── logger/
│   │   │   └── index.ts
│   │   └── test/
│   └── cli/                     # @cogenta/cli
│       └── src/commands/        # doctor, migrate, generate (squelettes)
├── examples/
└── .github/workflows/
```

## Interfaces à produire

### Configuration

```ts
// cogenta.config.ts, à la racine d'un projet utilisateur
export default defineConfig({
  site: { name: string, url: string, locales: string[], defaultLocale: string },
  database: { driver: 'postgres'|'mysql'|'sqlite', url: string },
  cache?:   { driver: 'redis'|'file'|'memory', url?: string },
  queue?:   { driver: 'redis'|'database', url?: string },
  storage?: { driver: 's3'|'local', bucket?, region?, endpoint?, path? },
  llm?:     { provider, model, apiKey, baseUrl? },
  embeddings?: { provider: 'local'|'openai'|…, model, dimensions },
})
```

Résolution : valeurs par défaut → fichier de config → variables d'environnement.
Les secrets viennent **uniquement** de l'environnement, jamais du fichier.
Validation Zod à l'entrée : une config invalide échoue au démarrage, avec un message
qui nomme le champ et la valeur attendue.

### Driver

```ts
interface Driver<T> {
  readonly name: string
  readonly tier: 'optimal' | 'degraded'
  available(config): Promise<boolean>   // le service répond-il ?
  init(config): Promise<T>
  dispose(): Promise<void>
  health(): Promise<HealthReport>
}
```

Le registre sélectionne : si la config nomme un driver, il est utilisé et un échec est
fatal. Si elle n'en nomme aucun, on prend le premier `available()` par ordre de tier.
Le résultat de la sélection est **journalisé et exposé** — l'admin doit pouvoir dire
« file de jobs : base de données (dégradé), car Redis est absent ».

### Cache

```ts
interface CacheDriver {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, opts?: { ttl?: number, tags?: string[] }): Promise<void>
  delete(key: string): Promise<void>
  invalidateTags(tags: string[]): Promise<void>
  clear(): Promise<void>
}
```

L'invalidation par tags est **obligatoire dans toutes les implémentations**, y compris
`file` et `memory`. C'est ce qui rend le cache de contenu correct plus tard ; l'ajouter
après coup impose de tout réécrire.

### Queue

```ts
interface QueueDriver {
  enqueue(job: { name, payload, runAt?, priority?, maxAttempts? }): Promise<JobId>
  process(name: string, handler: JobHandler): void
  tick(): Promise<number>       // driver database : appelé par le cron
  cancel(id: JobId): Promise<void>
  status(id: JobId): Promise<JobStatus>
}
```

Le driver `database` doit être **idempotent et sûr en concurrence** : verrouillage par
`SELECT … FOR UPDATE SKIP LOCKED` sur Postgres et MySQL, transaction immédiate sur
SQLite. Deux ticks simultanés ne doivent jamais traiter le même job.

### Storage

```ts
interface StorageDriver {
  put(key, data: Buffer|Stream, opts?: { contentType, cacheControl }): Promise<void>
  get(key): Promise<Stream>
  delete(key): Promise<void>
  exists(key): Promise<boolean>
  signedUrl(key, expiresIn: number): Promise<string>
  publicUrl(key): string
}
```

### Erreurs

```ts
class CogentaError extends Error {
  code: string          // 'CONFIG_INVALID', 'DB_UNREACHABLE', …
  hint?: string         // ce que l'utilisateur doit faire
  cause?: unknown
}
```

Toute erreur destinée à l'utilisateur final porte un `hint`. Interdiction de
`throw new Error("…")` nu dans le code de bibliothèque.

## Tâches, dans l'ordre

1. Monorepo, TypeScript strict partagé, lint, format, Turborepo, Changesets
2. Chargement et validation de configuration
3. Erreurs typées et logger structuré
4. Interfaces de drivers + registre + sélection + rapport de santé
5. Drivers base : Drizzle sur les trois dialectes, pool de connexions
6. Moteur de migrations : génération, application, rollback, table de suivi
7. Drivers cache : memory → file → redis
8. Drivers queue : database → redis/BullMQ
9. Drivers storage : local → S3
10. Harnais de tests : conteneurs éphémères pour Postgres et MySQL, SQLite en fichier
11. `cogenta doctor` : diagnostic d'environnement, drivers détectés, versions, avertissements
12. CI : lint, types, tests sur Node 22 et 24, Linux et macOS, x64 et ARM

## Critères d'acceptation

- Les trois bases passent **la même** suite de tests d'intégration
- Un driver dégradé se substitue à son équivalent optimal sans modification du code appelant
- Une configuration invalide échoue au démarrage avec un message nommant le champ fautif
- `cogenta doctor` affiche les drivers sélectionnés et pourquoi
- Deux workers concurrents sur la queue `database` ne traitent jamais le même job
- L'invalidation par tags fonctionne identiquement sur les trois drivers de cache
- Aucun secret n'apparaît dans les logs, vérifié par test
- Le build complet du monorepo passe sur ARM

## Tests exigés

| Type | Portée |
|---|---|
| Unitaire | Résolution de config, sélection de driver, erreurs |
| Intégration | Chaque driver contre son service réel, les trois dialectes |
| Concurrence | Queue `database` avec N workers simultanés |
| Contrat | Une suite unique jouée contre toutes les implémentations d'une interface |
| Fumée | `doctor` sur une machine sans Redis, sans Docker, sans S3 |

## Pièges connus

**Les différences de dialecte fuient.** `RETURNING` n'existe pas partout, les types de
date diffèrent, l'auto-increment n'est pas identique, SQLite n'a pas de type booléen
natif. Les encapsuler **dans la couche db**, jamais laisser un appelant tester le
dialecte.

**SQLite et la concurrence.** Activer le mode WAL, sinon les écritures concurrentes se
bloquent. Le driver queue doit en tenir compte.

**Les dépendances natives.** `better-sqlite3` compile. Prévoir le repli `node:sqlite`
(natif à Node 22+) et tester sur ARM et Alpine dès ce lot, pas après.

**Le pool de connexions.** Sur mutualisé, le nombre de connexions est très limité.
Le pool doit être configurable et par défaut modeste.

## Hors périmètre

Tout ce qui concerne le contenu, l'admin, le rendu et les agents. Aucun modèle de
données métier dans ce lot — uniquement l'infrastructure et la table de migrations.
