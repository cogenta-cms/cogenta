---
name: new-driver
description: Use when adding or modifying a Cogenta driver (cache, queue, storage, database, vector, realtime, image) — enforces the interface + registry + optimal/degraded pair + single contract test suite + doctor reporting that rule R1 requires.
---

# Ajouter un driver

Règle R1 : **aucune dépendance dure à une infrastructure.** Un driver n'est jamais seul.
Tout besoin d'infrastructure expose une interface et **au moins deux implémentations,
dont une sans service externe**.

## L'ordre, et il compte

### 1. L'interface avant les implémentations

Écris l'interface en partant du **driver dégradé**, pas de l'optimal. Une interface
dessinée d'après Redis contiendra des primitives que le driver fichier ne peut pas
honorer — et la fuite d'abstraction sera découverte trois lots plus tard.

Tout driver implémente le socle commun (`docs/lots/L0-socle.md`) :

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

### 2. La suite de contrat avant le code

Un fichier de tests paramétré par implémentation, jamais un fichier par driver.
Passe par le sous-agent `driver-parity-tester`.

### 3. Le driver dégradé avant l'optimal

Il est le chemin par défaut : `npm create cogenta` doit produire un site qui tourne
sans rien d'autre d'installé. C'est celui qui doit être le plus solide, pas le moins.

### 4. Le driver optimal

`available()` doit vérifier que le **service répond réellement**, pas seulement qu'une
URL est configurée.

### 5. L'enregistrement et la sélection

- Si la config **nomme** un driver : il est utilisé, et un échec est **fatal** — jamais
  de repli silencieux, l'utilisateur a demandé explicitement.
- Si elle n'en nomme aucun : premier `available()` par ordre de tier.
- Le résultat de la sélection est **journalisé et exposé**. `cogenta doctor` doit
  pouvoir dire : *« file de jobs : base de données (dégradé), car Redis est absent »*.

### 6. `doctor`, la config, la doc

Étends `cogenta doctor`, le schéma Zod de configuration, et la table optimal/dégradé de
`docs/02-architecture.md` § 2 si tu ajoutes un besoin.

## Les paires existantes

| Besoin | Optimal | Dégradé |
|---|---|---|
| File de jobs | Redis + BullMQ | table SQL drainée par cron |
| Planification | worker persistant | cron système, granularité 1 min |
| Cache | Redis | fichiers sur disque, puis mémoire |
| Stockage média | S3 / R2 / MinIO | système de fichiers local |
| Recherche vectorielle | pgvector, MariaDB VECTOR | cosinus exact en mémoire |
| Temps réel | WebSocket | SSE, puis polling |
| Image | `sharp` natif | WASM (`jsquash`) ou pré-calcul au build |

## Pièges spécifiques

**Cache** — l'invalidation par tags est **obligatoire dans toutes les implémentations**,
y compris `file` et `memory`. L'ajouter après coup impose de tout réécrire.

**Queue** — le driver `database` doit être idempotent et sûr en concurrence :
`SELECT … FOR UPDATE SKIP LOCKED` sur Postgres et MySQL, `BEGIN IMMEDIATE` sur SQLite.
Deux ticks simultanés ne traitent jamais le même job — testé avec N workers réels.

**Storage** — `signedUrl()` sur le driver local doit produire une URL signée réellement
vérifiée, pas un chemin brut. Attention au path traversal sur les clés.

**Dépendances natives (R10)** — repli WASM ou pré-calcul obligatoire.

## Terminé quand

- La suite de contrat passe sur **toutes** les implémentations.
- Un driver absent est **skippé avec message**, jamais compté comme réussi.
- Le code appelant est identique quel que soit le driver.
- `cogenta doctor` explique la sélection.
- Aucun secret dans les logs de sélection ni dans `health()`.
