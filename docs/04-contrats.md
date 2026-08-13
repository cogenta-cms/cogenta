# 04 — Contrats d'interface

> Quatre interfaces critiques. Si l'une bouge au sixième mois, tout ce qui est au-dessus
> casse. Elles sont **figées et versionnées en semver** avant que le lot qui les
> consomme ne soit écrit.

---

## Contrat A — Schéma de contenu

> **Figé en `schema@1.0` le 2026-08-13.** Toute modification incompatible impose une
> montée de version majeure et une note de migration.

### Définition d'un type

```ts
import { defineCollection, f } from '@cogenta/schema'

export const article = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/blog/:slug', locale: true },
  versioning: { drafts: true, history: true },
  fields: {
    title:     f.text({ required: true, max: 200, localized: true }),
    slug:      f.slug({ from: 'title', unique: true }),
    excerpt:   f.text({ max: 320, localized: true }),
    body:      f.richText({ localized: true }),
    cover:     f.media({ accept: ['image'], required: true }),
    author:    f.relation({ to: 'author', required: true, onDelete: 'restrict' }),
    tags:      f.relation({ to: 'tag', many: true }),
    publishedAt: f.datetime(),
    blocks:    f.blocks({ allow: '*' }),
  },
  indexes: [['publishedAt', 'desc'], ['slug']],
  permissions: {
    read:    ['public'],
    create:  ['editor', 'admin'],
    update:  ['editor', 'admin'],
    delete:  ['admin'],
    publish: ['admin'],
  },
})
```

### Types de champ (v1)

`text` · `richText` · `slug` · `number` · `boolean` · `date` · `datetime` · `media` ·
`relation` · `select` · `json` · `geo` · `color` · `blocks`

Chaque champ expose : `required`, `default`, `localized`, `unique`, `validate`,
`admin` (libellé, aide, groupe, condition d'affichage).

**`localized` ne décrit pas un stockage.** C'est une métadonnée d'interface : elle
déclare qu'un champ se traduit, ce qui autorise l'admin à proposer la recopie depuis
l'entrée source. Le modèle de traduction est décrit ci-dessous (ADR-0014).

### Identifiants

Tout contenu est identifié par un **UUIDv7 généré par l'application**, jamais par la
base (ADR-0015). Le type physique est choisi par la couche de données — `uuid` sur
Postgres, `char(36)` sur MySQL, `text` sur SQLite — et n'est jamais exposé à un appelant.

Un identifiant est stable et transportable : la même entrée porte le même identifiant en
développement, en staging et en production. C'est ce qui rend la migration de contenu
entre environnements possible sans réécrire les clés étrangères.

### Champs système, présents sur tout contenu

```
id · createdAt · updatedAt · createdBy · updatedBy
status: draft | scheduled | published | archived
locale · translationOf · version
provenance: human | assisted | generated
provenanceDetail: { agent, model, at, prompt? }
```

Le champ `provenance` n'est pas optionnel. Il est requis par le cadre européen sur l'IA
et doit exister dès la première migration.

### Internationalisation

**Une entrée par langue** (ADR-0014). Chaque entrée porte son `locale` ; une traduction
porte en plus un `translationOf` qui référence l'entrée source. L'ensemble des entrées
partageant une source forme une **famille de traduction**.

Conséquences qui font partie du contrat :

- `status`, `publishedAt`, `version` et les permissions s'appliquent **par langue**. Une
  langue peut être publiée pendant qu'une autre est encore en brouillon.
- Un champ non traduit est dupliqué dans chaque entrée de la famille. L'admin doit rendre
  visible ce qui diverge de la source.
- `hreflang` et les redirections entre langues se déduisent de la famille.

### Texte riche

`richText` stocke un **document JSON structuré**, jamais du HTML (ADR-0013).

```ts
type RichTextDocument = RichTextNode[]

interface TextBlock {
  _key: string                    // stable : diff, commentaires, ancres
  _type: 'block'
  style: 'normal' | 'h2' | 'h3' | 'h4' | 'blockquote'
  listItem?: 'bullet' | 'number'
  level?: number                  // imbrication de liste, à partir de 1
  children: Span[]
  markDefs: MarkDefinition[]
}

interface Span {
  _key: string
  _type: 'span'
  text: string
  marks: string[]                 // 'strong' | 'em' | 'code' | ou un markDefs._key
}

type MarkDefinition =
  | { _key: string, _type: 'link', href: string, rel?: string }
  | { _key: string, _type: 'internalLink', collection: string, id: string }

/** Nœud non textuel autorisé dans un document. */
type RichTextNode = TextBlock | { _key: string, _type: 'media', id: string, caption?: string }
```

`h1` est absent du vocabulaire : le titre de la page est le seul `h1`, et le laisser
disponible dans le corps casse la hiérarchie d'en-têtes et l'accessibilité.

Un lien interne référence une **entité**, pas une URL. Déplacer ou renommer la cible ne
casse pas le lien, et la suppression de la cible est détectable.

### Relations

- **`many: false`** — colonne portant l'identifiant, avec une **clé étrangère réelle**.
- **`many: true`** — table de jointure, avec une clé étrangère réelle de chaque côté.

`onDelete` vaut `'restrict'` (défaut), `'cascade'` ou `'setNull'`. `'setNull'` n'a de sens
que sur une relation à un et un champ non requis.

**Le défaut est `'restrict'` délibérément.** Supprimer un auteur ne doit pas effacer
silencieusement ses articles : une erreur qui nomme ce qui bloque — « 3 articles
référencent cet auteur » — est un meilleur défaut qu'une cascade irrécupérable.

### Zones de blocs

`f.blocks()` ne stocke pas un tableau JSON dans la ligne de contenu. Chaque bloc est une
**entrée propre, ordonnée, portant un `_key` stable** et rattachée à son contenu.

C'est une contrainte de contrat, pas un détail d'implémentation : trois choses en
dépendent et deviennent impossibles autrement — répondre « quelles pages utilisent ce
média ou cette entité » pour la médiathèque, invalider le cache par tags à la
publication, et découper le contenu par bloc pour le RAG.

### Permissions

Les **actions sont figées** : `read`, `create`, `update`, `delete`, `publish`.

Les **rôles sont un ensemble ouvert de noms**, déclarés dans la configuration du site.
Quatre rôles sont livrés par défaut : `public`, `viewer`, `editor`, `admin`. Un nom de
rôle inconnu au chargement du schéma est une erreur de configuration, pas un refus
silencieux.

Le rattachement des rôles aux utilisateurs relève de l'authentification (lot L2). Les
permissions des agents relèvent du contrat C et n'utilisent pas ce vocabulaire.

### Migrations

Le schéma génère les migrations. Une migration porte : une version, une direction
up/down, un impact sur les données existantes, et une estimation de durée. Toute
migration destructive exige une confirmation explicite et un backup préalable vérifié.

### Versionnement

`schema@1.x` — l'ajout d'un type de champ est mineur. La modification de la signature
d'un champ existant est majeure.

---

## Contrat B — Vocabulaire de blocs

> **Figé en `blocks@1.0` le 2026-08-13.**

**Règle absolue** : un bloc stocke de la donnée sémantique. Jamais de HTML, jamais de
classes CSS, jamais de valeur de style.

### Le vocabulaire v1 — douze blocs

| Bloc | Données | Rôle |
|---|---|---|
| `hero` | eyebrow, title, subtitle, media, actions[] | En-tête de page |
| `prose` | richText | Texte long |
| `mediaFigure` | media, caption, credit, ratio, align | Image ou vidéo légendée |
| `featureGrid` | title, items[{icon, title, text, link}] | Grille de bénéfices |
| `cta` | title, text, actions[] | Appel à l'action |
| `gallery` | items[media], layout: grid\|carousel\|masonry | Galerie |
| `quote` | text, author, role, avatar | Citation |
| `faq` | items[{question, answer}] | Questions fréquentes |
| `stats` | items[{value, unit, label}] | Chiffres clés |
| `logos` | title, items[{media, name, url}] | Références |
| `collectionList` | collection, filter, sort, limit, layout | Liste dynamique |
| `embed` | provider, url, ratio, consentRequired | Contenu externe |

### Schéma d'un bloc

Un bloc décrit ses champs avec **les mêmes types `f.*` que le contrat A**, restreints à
un sous-ensemble : `text`, `richText`, `number`, `boolean`, `media`, `relation`, `select`,
`color`, `json`.

Un seul système de types pour le contenu et pour les blocs : un validateur, un rendu
d'admin, une cible pour la génération par IA. Un second vocabulaire doublerait la surface
sans rien apporter.

**Pas d'imbrication en v1** : `f.blocks()` n'est pas disponible dans le schéma d'un bloc.
Le vocabulaire doit rester petit et prévisible (ADR-0009) ; l'imbrication est la porte
d'entrée d'un constructeur de mise en page, ce que Cogenta n'est pas.

### Actions

`actions[]` apparaît dans `hero` et `cta`. Sa forme est fixée :

```ts
interface Action {
  label: string
  target: { href: string } | { collection: string, id: string }
  emphasis?: 'primary' | 'secondary'
}
```

`emphasis` décrit une **intention sémantique** — quelle action compte le plus — que le
thème traduit comme il l'entend. Ce n'est pas une classe CSS déguisée : `style: 'btn-lg'`
serait une valeur de présentation, donc interdite par la règle absolue ci-dessus. La
nuance est mince à l'écrit et décisive à l'usage.

### Manifeste de bloc

```ts
defineBlock({
  name: 'hero',
  version: '1.0.0',
  schema: { /* champs f.*, sous-ensemble ci-dessus */ },
  runtime: 'static',        // static | server | edge
  fallback: null,           // requis pour un bloc hors vocabulaire
  a11y: { headingLevel: 'h1' },
})
```

`runtime` alimente le refus de build statique. `fallback` désigne le bloc du
vocabulaire standard à utiliser si le thème actif n'implémente pas ce bloc — obligatoire
pour tout bloc propriétaire à un thème. C'est ce qui empêche le verrouillage.

### Identité et ordre

Chaque bloc posé dans un contenu porte un **`_key` stable**, conservé tant qu'il existe.
Il survit à une réorganisation, à une traduction et à une restauration de version.

C'est ce qui permet de commenter un bloc précis, de diffuser un diff lisible entre deux
versions, et de ne réindexer pour le RAG que les blocs réellement modifiés.

### Versionnement

`blocks@1.x`. Ajouter un bloc est mineur. Modifier le schéma d'un bloc existant est
majeur et impose une migration automatique du contenu déjà saisi.

---

## Contrat C — Outil agentique

```ts
defineTool({
  name: 'content.publish',
  version: '1.0.0',
  description: 'Publie un contenu existant.',
  input:  z.object({ collection: z.string(), id: z.string() }),
  output: z.object({ url: z.string(), publishedAt: z.string() }),

  permissions: ['content.publish'],
  sideEffects: true,
  reversible: true,
  cost: 'low',
  rateLimit: { perHour: 20 },

  async execute(input, ctx) {
    // ctx.site, ctx.actor, ctx.logger, ctx.db (selon permissions accordées)
  },

  async revert(receipt, ctx) { /* … */ },
})
```

### Règles

- Un outil **déclare** ses permissions. Le runtime les vérifie avant l'appel, pas dans
  l'outil.
- Un outil `sideEffects: true` **doit** implémenter `revert`, ou être marqué
  `reversible: false` et exiger une validation humaine quel que soit le niveau
  d'autonomie de l'agent.
- Tout appel produit une entrée d'audit : acteur, agent, outil, entrée, sortie, diff,
  coût, durée.
- Un outil ne reçoit **jamais** les secrets. Les identifiants d'un service externe sont
  injectés par le runtime dans un client pré-configuré.

### Taxonomie des permissions

```
content.read · content.write_draft · content.publish · content.delete
media.read · media.write
schema.read
site.config_read · site.config_write
deps.scan · deps.patch
build.trigger · deploy.trigger
http.fetch(domains[]) · channel.send(channel)
agent.delegate · memory.read · memory.write
```

### Définition d'un agent

```ts
defineAgent({
  name: 'security',
  identity: './identities/security.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['deps.scan', 'deps.patch', 'content.read', 'channel.send'],
  skills: ['cve-triage', 'security-report'],
  subagents: ['dependency-analyst'],   // sous-ensemble strict de tools
  autonomy: { default: 'propose', 'deps.scan': 'autonomous' },
  budget: { tokensPerDay: 200_000, eurPerMonth: 10, callsPerHour: 30 },
  memory: { episodic: true, semantic: true, procedural: true, scope: 'site' },
  triggers: [
    { on: 'cve.published' },
    { on: 'schedule', cron: '0 6 * * *' },
  ],
})
```

### Versionnement

`tools@1.x`. La signature d'un outil est un contrat public : la modifier est majeur.

---

## Contrat D — Thème

> **Figé en `theme@1.1` le 2026-08-13.** Ajouter une entrée à `ctx` est mineur ; en
> modifier une est majeur.
>
> `1.1` ajoute `ImageSource.kind` et définit `ContentEntry` et `MediaReference` — trois
> manques trouvés en écrivant les consommateurs du contrat, qui rendaient toute vidéo
> irrécupérable et laissaient deux types centraux à l'interprétation de chaque thème.

### Structure minimale

```
mon-theme/
  theme.config.ts        # manifeste
  tokens.json            # skin par défaut
  src/
    layouts/Base.astro
    pages/               # optionnel : surcharge du routage
    blocks/              # un fichier par bloc du vocabulaire
      Hero.astro
      Prose.astro
      …
    components/
```

### Manifeste

```ts
defineTheme({
  name: 'canonical',
  version: '1.0.0',
  engine: '^1.0.0',            // version du contrat de thème
  blocks: '^1.0.0',            // version du vocabulaire supportée
  implements: ['hero', 'prose', /* … */],
  collections: ['article', 'page'],   // types attendus, ou '*'
  runtime: 'static',
  tokens: './tokens.json',
  a11y: { verified: 'WCAG-2.2-AA' },
})
```

Un thème qui ne déclare pas `implements` pour un bloc du vocabulaire **échoue à
l'installation**. C'est la garantie qu'un changement de thème n'efface pas de contenu.

### Isolation, vérifiée à l'installation

Le code de thème s'exécute sans secrets et sans connexion à la base (R5, ADR-0004). Ce
n'est pas une convention : c'est vérifié.

**Imports refusés à l'installation** : `node:fs`, `node:child_process`, `node:net`,
`node:http`, `node:https`, `node:dgram`, `node:worker_threads`, `node:vm`,
`node:process`, ainsi que `@cogenta/core`, `@cogenta/schema` et tout paquet de driver de
base. Un thème qui en importe un est **refusé**, pas averti.

La vérification est statique, sur les sources du thème, et elle échoue en nommant le
fichier, la ligne et l'import.

### Interface d'un composant de bloc

```astro
---
// src/blocks/Hero.astro
import type { HeroBlock } from '@cogenta/blocks'
const { block, ctx } = Astro.props as { block: HeroBlock, ctx: RenderContext }
---
```

### `RenderContext`

```ts
interface RenderContext {
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  /** The locale being rendered. */
  readonly locale: string
  /** The URL being rendered, already resolved. */
  readonly url: URL

  /** Translation. An unknown key returns the key, never an empty string. */
  t(key: string, values?: Readonly<Record<string, string | number>>): string

  /** Image variants. Returns what a responsive `<img>` needs, nothing more. */
  image(media: MediaReference, options?: ImageOptions): ImageSource

  /** URL of an entry, of a path, or of an external target. Locale-aware. */
  link(target: { collection: string; id: string } | { path: string } | string): string

  /** Read-only content access. The only door to data a theme has. */
  readonly content: ContentClient
}

/**
 * A media entity as a theme receives it. `kind` and `poster` are what let a
 * theme render a `<video>` rather than a broken `<img>`.
 */
interface MediaReference {
  readonly id: string
  readonly kind: 'image' | 'video'
  readonly alt?: string
  readonly width?: number
  readonly height?: number
  readonly focal?: { readonly x: number; readonly y: number } | null
  readonly poster?: string
}

interface ImageOptions {
  readonly width?: number
  readonly height?: number
  readonly format?: 'avif' | 'webp' | 'jpeg' | 'png'
  readonly fit?: 'cover' | 'contain'
}

interface ImageSource {
  /**
   * What this media actually is.
   *
   * `hero.media` and `mediaFigure.media` accept an image **or** a video
   * (contract B), and a theme that cannot tell them apart renders every video
   * as a broken `<img>`. Added in theme@1.1: a theme that ignores it still
   * compiles, which is why this is a minor version and not a break.
   */
  readonly kind: 'image' | 'video'
  readonly src: string
  /** Empty for a video: there is no responsive source set to offer. */
  readonly srcset: string
  readonly width: number
  readonly height: number
  /** Alt text and focal point come from the media entity, never invented here. */
  readonly alt: string
  readonly focal: { readonly x: number; readonly y: number } | null
  /** Video only: the still shown before playback. */
  readonly poster?: string
}

/**
 * What a theme receives for one entry.
 *
 * The system fields of contract A, plus the collection's own fields under
 * `values` and its block zones under `blocks`. A theme never sees a draft:
 * see the token scope above.
 */
interface ContentEntry {
  readonly id: string
  readonly locale: string
  readonly status: 'published'
  readonly createdAt: string
  readonly updatedAt: string
  readonly publishedAt: string | null
  readonly provenance: 'human' | 'assisted' | 'generated'
  readonly values: Readonly<Record<string, unknown>>
  readonly blocks: Readonly<Record<string, readonly PlacedBlock[]>>
}

interface ContentClient {
  entry(collection: string, id: string): Promise<ContentEntry | null>
  byPath(path: string): Promise<ContentEntry | null>
  list(request: QueryRequest): Promise<Page<ContentEntry>>
}
```

`ctx` expose **cela et rien d'autre**. Ni la base, ni les secrets, ni `fs`.

**`content` est un client HTTP vers l'API de contenu, porteur d'un jeton restreint en
lecture** (ADR-0016). C'est ce qui rend `collectionList` possible sans donner au thème
autre chose qu'un droit de lecture — la sandbox tombe de l'architecture des deux plans
plutôt que d'être ajoutée par-dessus.

Un thème ne voit jamais un brouillon : le jeton porte les droits du rôle `public`,
sauf en prévisualisation où il porte un `PreviewGrant` limité à une entrée.

### Tokens de skin

L'ensemble est **fermé et complet** : un skin qui omet un token est refusé. C'est la
condition pour que la génération par IA soit sûre par construction (L9).

```json
{
  "color":  { "bg": "…", "fg": "…", "accent": "…", "accentFg": "…",
              "muted": "…", "mutedFg": "…", "border": "…" },
  "font":   { "sans": "…", "serif": "…", "mono": "…", "scale": 1.25, "baseSize": "1rem" },
  "space":  { "unit": "0.25rem", "density": "compact | comfortable | spacious" },
  "radius": { "sm": "…", "md": "…", "lg": "…" },
  "motion": { "duration": "…", "easing": "…", "reduced": true },
  "shadow": { "sm": "…", "md": "…" }
}
```

Rendus en variables CSS `--cogenta-<groupe>-<nom>` dans une feuille unique.
**Changement de skin = réécriture de ce fichier, sans build.**

Contraintes vérifiées à l'enregistrement, en refus dur :

- **contraste AA** (4,5:1 pour le texte, 3:1 pour le texte large) sur toutes les paires
  déclarées : `fg`/`bg`, `accentFg`/`accent`, `mutedFg`/`muted`
- **échelle typographique monotone croissante**
- **aucun token manquant**, l'ensemble étant fermé
- `motion.reduced` présent, et respecté sous `prefers-reduced-motion`

### Besoins runtime

Un thème déclare `runtime: 'static' | 'server' | 'edge'`. Une cible de build qui ne peut
pas satisfaire le besoin d'un thème, d'un bloc ou d'un plugin **échoue** en nommant
l'élément, la raison et les options. Jamais de dégradation silencieuse.

### Versionnement

`theme@1.x`. Ajouter une entrée à `ctx` est mineur. En modifier une est majeur.
