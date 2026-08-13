# 04 — Contrats d'interface

> Quatre interfaces critiques. Si l'une bouge au sixième mois, tout ce qui est au-dessus
> casse. Elles sont **figées et versionnées en semver** avant que le lot qui les
> consomme ne soit écrit.

---

## Contrat A — Schéma de contenu

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
    author:    f.relation({ to: 'author', required: true }),
    tags:      f.relation({ to: 'tag', many: true }),
    publishedAt: f.datetime(),
    blocks:    f.blocks({ allow: '*' }),
  },
  indexes: [['publishedAt', 'desc'], ['slug']],
  permissions: {
    read:    ['public'],
    create:  ['editor', 'admin'],
    update:  ['editor', 'admin'],
    publish: ['admin'],
  },
})
```

### Types de champ (v1)

`text` · `richText` · `slug` · `number` · `boolean` · `date` · `datetime` · `media` ·
`relation` · `select` · `json` · `geo` · `color` · `blocks`

Chaque champ expose : `required`, `default`, `localized`, `unique`, `validate`,
`admin` (libellé, aide, groupe, condition d'affichage).

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

### Migrations

Le schéma génère les migrations. Une migration porte : une version, une direction
up/down, un impact sur les données existantes, et une estimation de durée. Toute
migration destructive exige une confirmation explicite et un backup préalable vérifié.

### Versionnement

`schema@1.x` — l'ajout d'un type de champ est mineur. La modification de la signature
d'un champ existant est majeure.

---

## Contrat B — Vocabulaire de blocs

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

### Manifeste de bloc

```ts
defineBlock({
  name: 'hero',
  version: '1.0.0',
  schema: { /* champs typés */ },
  runtime: 'static',        // static | server | edge
  fallback: null,           // requis pour un bloc hors vocabulaire
  a11y: { headingLevel: 'h1' },
})
```

`runtime` alimente le refus de build statique. `fallback` désigne le bloc du
vocabulaire standard à utiliser si le thème actif n'implémente pas ce bloc — obligatoire
pour tout bloc propriétaire à un thème. C'est ce qui empêche le verrouillage.

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

### Interface d'un composant de bloc

```astro
---
// src/blocks/Hero.astro
import type { HeroBlock } from '@cogenta/blocks'
const { block, ctx } = Astro.props as { block: HeroBlock, ctx: RenderContext }
---
```

`ctx` expose : `site`, `locale`, `url`, `t()` pour les traductions, `image()` pour les
variantes, `link()` pour les URL. **Il n'expose ni la base, ni les secrets, ni `fs`.**

### Tokens de skin

```json
{
  "color":   { "bg": "…", "fg": "…", "accent": "…", "muted": "…", "border": "…" },
  "font":    { "sans": "…", "serif": "…", "mono": "…", "scale": 1.25 },
  "space":   { "unit": "0.25rem", "density": "comfortable" },
  "radius":  { "sm": "…", "md": "…", "lg": "…" },
  "motion":  { "duration": "…", "easing": "…", "reduced": true },
  "shadow":  { "sm": "…", "md": "…" }
}
```

Rendus en variables CSS. **Changement de skin = réécriture de ce fichier, sans build.**

Contraintes vérifiées automatiquement à l'enregistrement d'un skin : contraste AA sur
toutes les paires texte/fond, échelle typographique monotone, tous les tokens
renseignés. C'est ce qui rend la génération par IA sûre par construction.

### Versionnement

`theme@1.x`. Ajouter une entrée à `ctx` est mineur. En modifier une est majeur.
