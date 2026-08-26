# 04 — Contrats d'interface

> Quatre interfaces critiques. Si l'une bouge au sixième mois, tout ce qui est au-dessus
> casse. Elles sont **figées et versionnées en semver** avant que le lot qui les
> consomme ne soit écrit.

---

## Contrat A — Schéma de contenu

> **Figé en `schema@2.0` le 2026-08-16** (ADR-0022 — taxonomies natives et corbeille,
> les deux en une seule montée majeure). Toute modification incompatible impose une
> montée de version majeure et une note de migration.
> **Monté en `schema@2.1` le 2026-08-20** (ADR-0027 — workflow éditorial et
> permission par propriétaire), montée **mineure et strictement additive** : voir
> « Champs système » et « Permissions » ci-dessous.

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
deletedAt: string | null
reviewState: none | pending | changes-requested | approved
assignedReviewer: string | null
locale · translationOf · version
provenance: human | assisted | generated
provenanceDetail: { agent, model, at, prompt? }
```

Le champ `provenance` n'est pas optionnel. Il est requis par le cadre européen sur l'IA
et doit exister dès la première migration.

**`deletedAt` (`schema@2.0`, ADR-0022) est orthogonal à `status`, jamais une valeur de
`status`.** Une entrée à la corbeille garde son `status` d'origine — un article publié
mis à la corbeille reste `published` en mémoire, et `untrash()` ne le fait jamais
retomber en `draft`. Toute lecture (`read`, `list`, `translations`, `resolveLocale`,
`history`) filtre `deletedAt is null` par défaut ; seul un appelant qui demande
explicitement la corbeille la voit. `delete()` écrit `deletedAt` ; `purge()` est le seul
`DELETE` SQL réel ; `untrash()` annule la mise à la corbeille. Une fenêtre de purge se
déclare par collection sur le modèle de `versioning.keep` : `trash: { retainDays: 30 }`,
`false` pour revenir à une suppression dure immédiate.

**`reviewState` (`schema@2.1`, ADR-0027) est orthogonal à `status`, exactement comme
`deletedAt`.** Ignoré par défaut par toute lecture existante : un client qui lit
`status` et ignore le reste du contrat obtient exactement les mêmes valeurs qu'avant
cette montée. `'none'` tant que l'entrée n'est jamais entrée dans le workflow.
`approved` **n'est pas** `published` — approuver autorise, publier reste l'action
`publish`. Trois transitions, table fermée côté serveur :

```
submit          none | changes-requested → pending           (action: update)
approve         pending → approved                            (action: publish)
requestChanges  pending → changes-requested                    (action: publish)
```

Le workflow est **optionnel par collection** : `workflow: { enabled: true }` sur
`defineCollection()`. Absent, une collection se comporte exactement comme avant
`schema@2.1` — aucune route de transition n'y répond (`CONTENT_WORKFLOW_DISABLED`).

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

**Depuis `schema@2.0` (ADR-0022), `restrict` est vérifié en code applicatif au moment
de la mise à la corbeille, pas seulement par la clé étrangère.** Mettre une entrée à la
corbeille n'est plus un `DELETE` SQL — la contrainte de base ne peut donc plus rien
refuser à ce moment-là. `ContentStore.delete()` doit lui-même refuser la mise à la
corbeille d'une entrée encore référencée par une relation `restrict`, avec le même
message qu'avant. Ne pas le faire est un défaut de sécurité de la donnée, pas un détail
d'implémentation.

### Taxonomies (`schema@2.0`, ADR-0022)

Un second objet déclarable de premier niveau, à côté de `defineCollection()` :

```ts
import { defineTaxonomy, f } from '@cogenta/schema'

export const category = defineTaxonomy({
  name: 'category',
  labels: { singular: { fr: 'Catégorie', en: 'Category' } },
})
```

Un **terme** de taxonomie porte `id`, `parent` (référence à un autre terme de la même
taxonomie, ou `null` à la racine), `slug`, `position` et un `labels` **indexé par
locale**. Un terme n'est **pas** un contenu : il n'a ni `status`, ni `version`, ni
`translationOf` — « Cuisine » et « Cooking » sont le même concept de classement, pas
deux contenus liés par ADR-0014 (qui gouverne le contenu, pas les taxonomies ; son
périmètre reste inchangé).

Un champ `f.taxonomy({ of: 'category', many: true })` référence des termes d'une
taxonomie déclarée, réutilisable telle quelle entre plusieurs collections.

L'arborescence est stockée en **chemin matérialisé**, maintenu à l'écriture — jamais un
CTE récursif, dont le support diverge entre Postgres, MySQL/MariaDB et SQLite
(ADR-0006). « Tout le contenu de ce sous-arbre » se répond par un `like` sur le chemin,
identique sur les trois dialectes.

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

**Permission par propriétaire (`schema@2.1`, ADR-0027).** Chaque grant reste soit une
liste de rôles (la forme d'avant 2.1, toujours valide), soit `{ roles, own?: boolean }` :

```ts
permissions: {
  read:   ['public'],
  update: { roles: ['author'], own: true },   // « ses propres entrées », jamais celles d'un autre
  publish: ['editor'],
}
```

`own: true` s'applique **uniformément** à tous les rôles listés pour cette action — pas
un mélange par rôle, et pas de sens sur `create` (une entrée neuve n'a pas encore de
propriétaire ; refusé à la définition). `PermissionLayer.can()`/`.assert()` comparent
alors l'acteur au `createdBy` de l'entrée ; sans cette information, l'accès est refusé
par défaut.

### Migrations

Le schéma génère les migrations. Une migration porte : une version, une direction
up/down, un impact sur les données existantes, et une estimation de durée. Toute
migration destructive exige une confirmation explicite et un backup préalable vérifié.

### Versionnement

L'ajout d'un type de champ est mineur. La modification de la signature d'un champ
existant est majeure.

`schema@1.0 → 2.0` (ADR-0022, 2026-08-16) : ajout du champ système `deletedAt`
(orthogonal à `status`), changement de sens de `delete()`/nouvelles méthodes
`purge()`/`untrash()`, et ajout de `defineTaxonomy()`/`f.taxonomy()`. `status` n'a pas
changé. Migration réversible ; le `down` supprime `deletedAt` et perd la corbeille —
sans coût aujourd'hui, le projet n'ayant encore aucun site en production.

`schema@2.0 → 2.1` (ADR-0027, 2026-08-20) : ajout des champs système `reviewState`
(orthogonal à `status`, exactement comme `deletedAt`) et `assignedReviewer` ; nouvelles
méthodes `ContentStore.submitForReview()`/`approveReview()`/`requestReviewChanges()`/
`assignReviewer()` ; nouvelles routes REST `POST .../submit`, `.../approve`,
`.../request-changes`, `.../assign-reviewer` ; `CollectionPermissionRule` gagne la
forme `{ roles, own? }` en plus de la liste de rôles (toujours valide) ; nouveau champ
optionnel `workflow: { enabled: boolean }` sur `defineCollection()`. **Strictement
additive** : `status` n'a pas changé, aucune signature existante n'a bougé, un client
qui ne lit que `status` obtient exactement les mêmes valeurs qu'avant (prouvé par test
de compatibilité). Migration réversible ; non destructive — le `down` supprime les deux
colonnes, sans coût aujourd'hui puisqu'aucun site en production n'a de véritable
historique de relecture à perdre.

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

> **Figé en `tools@1.0` le 2026-08-14** (ADR-0020). Modifier la signature d'un outil
> existant impose une montée de version majeure et une note de migration.
>
> **`tools@1.1` le 2026-08-16** (L19 tâche 1) : ajout de la permission
> `document.extract` à la taxonomie. Aucune signature existante n'est touchée, aucun
> outil existant ne change — un ajout à une taxonomie ouverte par le bas est mineur,
> exactement comme l'ajout d'un `ErrorCode`.
>
> **`tools@1.2` le 2026-08-21** (L22 tâche 3, l'agent qui surveille le site) : ajout de
> deux permissions, `logs.read` et `redirects.write`. Même règle que `tools@1.1` :
> aucune signature existante ne change, l'ajout est par le bas. `logs.read` porte
> `logs.read_not_found` (lecture seule du journal des 404 publics,
> `NotFoundLogStore` — jamais le code source, jamais une requête ou une donnée
> personnelle, le journal lui-même n'en contient pas) ; `redirects.write` porte
> `redirects.create` (`sideEffects: true`, `reversible: true` — son `revert` retire
> exactement la redirection qu'il a créée). `content.collections`/`content.list`
> (mêmes deux outils, pour qu'un agent puisse choisir une page de redirection)
> réutilisent `content.read` telle quelle plutôt que d'ajouter une troisième entrée :
> parcourir n'est pas un accès plus large que lire une entrée.
>
> **`tools@1.3` le 2026-08-22** (L24 tâche 2, l'agent « Cogenta Developer ») : ajout
> de la permission `code.patch`. Même règle que `tools@1.1`/`tools@1.2` : aucune
> signature existante ne change, l'ajout est par le bas. `code.patch` porte
> `code.propose_patch` (`@cogenta/agents-builtin`, `sideEffects: true`,
> `reversible: true` — son `revert` ferme la pull request sans la fusionner, comme
> `deps.patch`) : ouvre une pull request portant le contenu complet d'un ou plusieurs
> fichiers du dépôt, jamais une écriture directe. Construit sur le même `PrClient`
> que `deps.patch` (`security/pr-client.ts`) plutôt que sur une seconde abstraction —
> seule sa forme d'entrée diffère (un ensemble de fichiers arbitraire plutôt qu'un
> bump de version d'une seule dépendance).
>
> **`tools@1.4` le 2026-08-26** (fiche 58 tâche 6, client MCP externe) : ajout de la
> forme paramétrée `mcp.external:<connexionId>.<nomOutilDistant>` à la taxonomie.
> Même règle que les montées précédentes : aucune signature d'outil existante ne
> change, l'ajout est par le bas. **Une permission par outil distant explicitement
> coché par l'admin, jamais par connexion** — `mcp.external.<connexion>` a été
> rejeté par la revue `security-reviewer` du 2026-08-26 (voir
> `docs/lots/58-mcp-serveur-et-client-externe.md`) : il aurait autorisé
> indifféremment tous les outils cochés d'une même connexion, quel que soit leur
> risque réel (un `read_file` et un `send_email` sur le même serveur), ce qui
> contredit directement le principe « case à cocher par outil » et affaiblit R4 (« un
> outil déclare ses permissions », pas sa connexion). Portée après `:`, cohérente
> avec la convention déjà en usage (`http.fetch:api.exemple.com`). Cette forme n'est
> jamais déclarée par le serveur distant lui-même — `wrapMcpTool` (`@cogenta/mcp`)
> n'appelle jamais `tools/list` pour la construire ; elle est toujours assemblée par
> le câblage runtime (`@cogenta/mcp`'s `buildMcpToolDefinitions`) à partir de l'id de
> connexion et du nom d'outil distant que l'admin a explicitement coché.

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
document.extract
logs.read · redirects.write
code.patch
mcp.external:<connexionId>.<nomOutilDistant>
```

`document.extract` (ajoutée en `tools@1.1`, L19 tâche 1) autorise la lecture du texte
d'un document fourni par un humain (PDF, DOCX, Markdown, texte brut). L'outil qui la
porte, `document.extract_text`, ne fait aucune E/S : il reçoit les octets, rend du
texte, et n'écrit nulle part. Le texte rendu est **de la donnée** (R8), jamais une
instruction — l'agent qui l'exploite le passe par le canal `data` de
`assembleContext`, jamais dans un prompt système.

`code.patch` (ajoutée en `tools@1.3`, L24 tâche 2) autorise un agent à ouvrir une
pull request portant un vrai changement de code du dépôt lui-même. Aucun outil ne
porte cette permission avec un autre effet que « ouvrir une PR » : il n'existe et ne
peut exister aucun chemin, à ce niveau d'autonomie ou à un autre, par lequel un agent
écrit directement dans le dépôt.

`mcp.external:<connexionId>.<nomOutilDistant>` (ajoutée en `tools@1.4`, fiche 58 tâche
6) autorise un agent à appeler **un** outil précis d'**une** connexion MCP externe
précise — jamais une connexion entière. Portée par un exécutable tiers réellement
spawné (`stdio`, `@cogenta/mcp`'s `createMcpStdioClient`), sans aucun isolat
`worker_threads`+`vm` comme `@cogenta/plugins` : le plancher de sécurité est
l'environnement explicite (jamais un héritage de `process.env`), un répertoire de
travail dédié, un timeout dur par appel qui tue le process, un veilleur mémoire/CPU
au mieux, et une confirmation explicite obligatoire à la création de toute connexion
`stdio` (voir `docs/05-securite.md`, section correspondante). Aucun outil distant
n'est jamais exposé implicitement : l'admin coche chaque outil un par un depuis
l'écran « MCP Clients », et le nom d'un outil jamais vu dans le dernier `tools/list`
réel est refusé.

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

**Le lien de prévisualisation** — `POST /api/content/{collection}/{id}/preview` (rôle
requis : lecture de l'état `working` sur cette entrée précise) émet ce `PreviewGrant`
sous forme de jeton signé HMAC-SHA256, valable une heure, et répond :

```json
{ "token": "…", "expiresIn": 3600, "path": "/blog/mon-article", "url": "https://…" }
```

`path` est `null` quand la collection n'a pas de route ; `url` est `null` quand le
serveur n'a pas de `site.url` configuré — dans les deux cas, le jeton reste utilisable
directement contre l'API de contenu.

Toute lecture `GET /{collection}/{id}` ou `GET /-/by-path` accepte `?preview=<jeton>`
en plus de `?state=working` (les deux sont nécessaires : le jeton ne change rien à
l'état demandé, il ne fait que lever le refus que `working` opposerait sinon à un
acteur `public`). Le jeton ne couvre que l'entrée qu'il nomme — toute autre entrée,
même avec un jeton valide, répond comme si le jeton n'existait pas (même 404 qu'un
inconnu, jamais un 403 qui confirmerait l'existence de l'entrée).

**Le rendu d'un brouillon non enregistré** — `POST /api/builder/render` (L16) rend une
liste de blocs que l'éditeur a à l'écran et n'a pas encore sauvegardée :

```json
{ "collection": "page", "entryId": "…", "blocks": { "body": [ … ] }, "values": { … } }
```

et répond `{ "html": "…" }`. Trois portes, dans cet ordre : un acteur authentifié
(jamais anonyme), `update` sur la collection vérifié par la même `PermissionLayer` que
toute écriture (R4), puis la lecture de l'entrée stockée à travers le même
`ContentGateway` que le reste — un brouillon ne peut donc pas servir à lire ce que
l'acteur ne pouvait pas déjà lire.

Le HTML rendu est celui de la vraie page : la route passe par la même et unique
fonction de rendu que la page publiée, jamais par un second moteur. La seule différence
est voulue et vérifiée par test — un aperçu lit la face `working` de l'entrée, donc il
porte `noindex, nofollow` et pas de lien canonique. Le corps du document, lui, est
identique octet pour octet.

**Deux attributs portés par tout rendu de page** (`@cogenta/theme-canonical`) rendent
cette correspondance exploitable : `data-block-key` porte la clé contrat B du bloc
placé, et `data-field` nomme le champ texte simple dont un élément porte la valeur
entière. Ils sont émis à chaque rendu, jamais seulement en mode aperçu — un aperçu
assemblé autrement que la page publiée est exactement la divergence que le constructeur
visuel existe pour empêcher.

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

---

## Contrat E — Commerce

> **Acté (ADR-0024), non figé.** Ce contrat repose sur l'**ADR-0024**, actée dans
> `docs/03-decisions.md`. Il n'est **délibérément pas figé** au moment de sa création :
> L15 est son premier et seul consommateur, et figer un modèle de commerce jamais
> confronté à une vraie boutique reproduirait l'erreur que le projet a évitée pour C et
> D.

### Pourquoi un contrat séparé et pas une extension du contrat A

Trois décisions déjà actées du contrat A rendent une commande impropre à être un
contenu :

- **ADR-0014** (une entrée par langue) produirait une commande française et une
  commande anglaise, liées par `translationOf`, chacune avec son cycle de publication.
- **ADR-0022** vient de rendre tout contenu restaurable depuis la corbeille. Une
  commande ne se restaure pas : elle s'annule ou se rembourse, et les deux laissent une
  trace qui reste.
- Le versionnement avec brouillons n'a aucun sens pour une vente.

À quoi s'ajoutent trois invariants que le contrat A n'a jamais eu à porter : un stock
qui ne devient jamais négatif sous écriture concurrente, un total cohérent avec ses
lignes, et un numéro de facture séquentiel non modifiable.

**La fiche produit, elle, reste du contrat A.** Un produit commerce porte
`contentRef: { collection, entryId } | null`, facultatif dans les deux sens. C'est ce
lien qui donne au catalogue le texte riche, les blocs, le SEO, les traductions et la
publication programmée, sans les réimplémenter. Ce n'est pas une clé étrangère SQL : la
table d'entrées d'une collection est produite par le moteur de migrations du contrat A à
partir du schéma déclaré par le site, donc le lien est vérifié en code applicatif.

### Objets

```
Product       handle unique, titre de repli, statut (active | archived), contentRef
Variant       sku unique, prix, devise, stock, backorder autorisé, poids, catégorie fiscale
Customer      email unique, nom, lien optionnel vers un compte @cogenta/auth
Cart          persistant, une devise, lignes, zone de livraison, méthode, coupon
Order         référence unique, lignes copiées, statut, historique append-only
Coupon        percentage | fixed | free_shipping, fenêtre, compteur de redemptions
Payment       driver, identifiant externe, statut, montant ; Refund lié
Invoice       numéro séquentiel par série, snapshot figé du document
Subscription  intervalle, prix convenu, cycles idempotents par période
```

Aucun de ces objets ne porte `status` de contenu, `version`, `translationOf` ni
`deletedAt`, et aucun ne passe par `ContentStore`.

### Argent

Tout montant est un **entier dans la plus petite unité de sa devise**
(`amountMinor: number`, `currency: string`, ISO 4217 en majuscules). Jamais de flottant,
jamais de décimal SQL : SQLite n'a que `REAL`, donc une colonne décimale ne voudrait pas
dire la même chose sur les trois bases obligatoires (ADR-0006). Tout taux est en
**points de base** (`2000` = 20 %), pour la même raison — `0,2` n'est pas représentable
en binaire.

Ordre de calcul d'un total, figé parce que chaque ordre est défendable et un seul est
conventionnel : sous-total de ligne, puis remise répartie sur les lignes au prorata,
puis **taxe par ligne après remise**, puis livraison. Taxer avant la remise surestime la
taxe et est faux dans la plupart des pays européens.

### Statuts de commande

```
pending   → paid | cancelled
paid      → shipped | cancelled | refunded
shipped   → delivered | refunded
delivered → refunded
cancelled, refunded : états finaux, rien n'en sort
```

`pending → shipped` est refusé volontairement : expédier avant paiement est une décision
qu'un humain prend explicitement, en marquant d'abord la commande payée, pour que la
raison soit tracée plutôt que sous-entendue.

### Permissions

Le contrat E déclare **son propre vocabulaire**, dans son espace de noms. Les cinq
actions du contrat A (`read`, `create`, `update`, `delete`, `publish`) sont figées et ne
s'étendent pas : « rembourser une commande » n'est ni un `update` ni un `publish`.

```
commerce.read            commerce.catalog.write    commerce.order.write
commerce.payment.settle  commerce.order.refund     commerce.invoice.issue
```

`commerce.payment.settle` (l'argent entre) et `commerce.order.refund` (l'argent sort)
sont séparées à dessein : le remboursement est la seule action qui sort des fonds de
l'entreprise sans contresignature.

### Driver de paiement

Interface plus au moins deux implémentations, comme cache, queue et storage (R1) :
Stripe en `optimal`, virement bancaire en `degraded`. Le driver dégradé n'est pas un
bouchon — beaucoup d'entreprises ne sont payées que par virement ; la différence est
*qui confirme que l'argent est arrivé*. R2 : sans clé Stripe, la boutique fonctionne de
bout en bout.

### Facture

Numéro séquentiel par série, dense **en factures émises** et non en commandes vivantes :
une commande annulée après facturation ne rend jamais son numéro. Le numéro est pris par
un compare-and-set dans la transaction qui écrit la facture, donc une facture annulée ne
brûle pas de numéro. Le document est un snapshot figé à l'émission ; le PDF s'en
regénère à l'identique, sans horloge ni aléa.

### Versionnement

`commerce@1.0` (ADR-0024, non figé — voir le bandeau en tête de section). Ajouter un
champ optionnel ou un statut de paiement est mineur ; modifier le sens d'un statut de
commande ou la représentation d'un montant est majeur.

---

## Contrat F — Commentaires

> **Acté (ADR-0025), non figé.** Ce contrat repose sur l'**ADR-0025**, actée dans
> `docs/03-decisions.md`, sur le même modèle qu'ADR-0024 pour le commerce. Il n'est
> **délibérément pas figé** au moment de sa création : la fiche 15 est son premier et
> seul consommateur.

### Pourquoi un contrat séparé et pas une extension du contrat A

Trois faits, sur le modèle d'ADR-0024 :

- **ADR-0014** forkerait un commentaire par langue. Un commentaire n'a pas de famille de
  traduction — il est écrit une fois, dans la langue de son auteur.
- **`published`/`draft` n'a pas le sens d'« approuvé »/« en attente ».** `published`
  signifie, dans tout le reste du contrat A, « visible sur sa propre route, indexable,
  avec SEO » — un commentaire n'a ni route ni existence indépendante de l'entrée qu'il
  commente.
- **Le volume et le modèle de menace sont d'un autre ordre.** `POST /api/comments` est la
  première route publique en écriture du CMS ; rate limiting, honeypot et anti-spam sont
  des préoccupations que le contrat A n'a aucune raison de porter pour les collections
  qui n'ont jamais reçu d'écriture anonyme.

### Objets

```
Comment   cible (collection, entryId, locale), auteur (compte OU nom+e-mail+site),
          corps en texte brut uniquement, statut (pending|approved|spam|trash),
          parentId (fil), ipHash (jamais l'IP en clair), provenance
```

Un commentaire ne porte ni `status` de contenu au sens du contrat A, ni `version`, ni
`translationOf`, ni corbeille au sens d'ADR-0022 (une suppression est directe, avec
rétention/purge configurable sur son propre modèle). Il ne passe jamais par
`ContentStore`.

### Corps : texte brut, sans exception

R3 s'applique ici en premier lieu : le corps d'un commentaire n'accepte **aucune balise
HTML**, refusée à l'écriture (`CommentStore.create`), et rendu via l'arbre `h()`/`text()`
de `@cogenta/theme-canonical` (pas d'échappatoire `raw()` dans ce paquet). Si un
formatage est un jour voulu, il se dérive du texte brut à l'affichage — jamais stocké.

### Permissions

Le contrat F déclare **son propre vocabulaire**, dans son espace de noms :

```
comments.read   comments.moderate   comments.reply   comments.purge   comments.settings
```

`comments.purge` est distinct de `comments.moderate` (destructif — une vraie suppression,
pas une mise à la corbeille) et `comments.settings` distinct des deux (change ce qui est
permis, pas un commentaire lui-même).

### Route publique en écriture

`POST /api/comments` — sans acteur requis, avec dès la première version : limitation de
débit par IP et par cible (`collection:entryId`), champ piège, délai minimal de
remplissage, heuristiques anti-spam sans IA. Un `<form method=post>` sans JavaScript
obtient une redirection `303` vers sa propre page (`redirectTo`, validée contre la
redirection ouverte et l'injection de réponse HTTP) plutôt qu'un corps JSON brut.

### Versionnement

`comments@1.0` (ADR-0025, non figé — voir le bandeau en tête de section). Ajouter un
champ optionnel est mineur ; changer le sens d'un statut ou la forme du fil est majeur.

---

## Contrat G — Formulaires

> **Acté (ADR-0026, amendement rédigé en ADR-0031, en attente d'insertion humaine dans
> `docs/03-decisions.md`), non figé.** Ce contrat repose sur l'**ADR-0026**, actée dans
> `docs/03-decisions.md` ; son renoncement initial sur le champ `file` et les champs
> conditionnels est levé par l'**ADR-0031** (texte rédigé, remis à l'humain — voir
> `docs/plans/47-formulaires-et-soumissions-premium.md` §8). La fiche 16 est son premier
> consommateur, la fiche 47 le second.

### Pourquoi un contrat séparé et pas une extension du contrat A

Même raisonnement qu'ADR-0024 (commerce) et ADR-0025 (commentaires) : une soumission de
formulaire est un fait constaté — elle arrive, elle ne se rédige pas — sans traduction,
sans brouillon, sans version. Son volume et son modèle de menace (une route publique en
écriture, un accusé de réception qui peut devenir un relais de spam) sont d'un autre
ordre que ce que le contrat A a jamais eu à porter.

### Objets

```
FormDefinition  nom unique, libellé, liste de champs typés, actif, message de
                confirmation ou redirection, destinataires de notification,
                accusé de réception (désactivé par défaut), rétention (jours),
                étapes (fiche 47), canaux de notification (fiche 47),
                CAPTCHA (fiche 47, désactivé par défaut)
FormSubmission  formulaire, valeurs, consentements horodatés (texte figé au
                moment du recueil), statut (nouveau | lu | archivé |
                indésirable), IP hachée (jamais en clair), référent, horodatage
FormSubmissionNote  note d'opérateur (fiche 47) — jamais montrée au visiteur,
                jamais exportée
```

Ni `FormDefinition` ni `FormSubmission` ne porte `status` de contenu, `version`,
`translationOf` ni `deletedAt`, et aucun ne passe par `ContentStore`.

### Champs

Dix types, fermés : `text`, `longText`, `email`, `phone`, `number`, `date`,
`choiceSingle`, `choiceMulti`, `consent`, **`file`** (fiche 47 tâche 3 — réouverture du
renoncement de l'ADR-0026, tracée en **ADR-0031**, rédigée et en attente d'insertion
humaine). Un champ `file` restreint sa catégorie acceptée
(`image`/`pdf`/`document`/`text`, sniffée sur les octets réels, jamais sur le nom de
fichier ni le `Content-Type` déclaré) et sa taille maximale, plafonnée dans tous les cas
par un maximum matériel non configurable.

Tout champ, quel que soit son type, peut porter `showIf` (fiche 47 tâche 1) : une
condition (`field`/`operator`/`value`) évaluée côté serveur contre la soumission brute —
un champ masqué n'est ni requis ni validé, avec ou sans JavaScript.

Un champ `consent` porte son propre texte (`consentText`), et c'est ce texte exact —
jamais celui d'aujourd'hui — qui est copié, horodaté, sur chaque soumission qui le coche :
c'est lui qui a valeur probante, pas la définition du formulaire au moment où on la
consulte.

### Étapes (fiche 47 tâche 2)

`FormDefinition.steps`, optionnel : chaque champ appartient à exactement une étape.
Rendu en `<form>` chaînés, aucun cadriciel client — chaque étape intermédiaire répond
`202 {status:'step', nextStep, values}` sans jamais créer de soumission ; seule l'étape
finale valide et enregistre, exactement comme un formulaire à page unique.

### La route publique

`POST /api/forms/{name}/submit` est la deuxième route publique en écriture du CMS, après
les commentaires (contrat F). Mêmes exigences : limitation de débit par IP et par
formulaire, champ piège, délai minimal de remplissage, validation serveur complète
indépendante du client. Elle **fonctionne sans JavaScript** — un `POST`
`application/x-www-form-urlencoded` classique, ou `multipart/form-data` dès qu'un champ
`file` est présent — et répond par une redirection vers la page de confirmation en cas de
succès ; une soumission refusée réaffiche ce que le visiteur a tapé, jamais un formulaire
vidé. Un CAPTCHA (Cloudflare Turnstile, fiche 47 tâche 10) peut être exigé sur la
dernière étape — désactivé par défaut, jamais obligatoire pour un formulaire qui ne l'a
pas explicitement activé, et seule fonctionnalité de ce contrat qui suppose du
JavaScript (le reste du formulaire continue de fonctionner sans, même sur ce
formulaire-là).

Arrivée sur une page : une **route dédiée** (`GET /forms/{name}`), rendue par le gabarit
comme `/search` (L10) — le contrat B est figé et un bloc `form` exige une RFC, ouverte en
parallèle sans bloquer cette fiche.

### Rétention et RGPD

Rétention configurable par formulaire (`retainDays`), purgée automatiquement sur le
modèle exact d'ADR-0022 (`retainDays`/`purgeExpired`, appliqué aux soumissions plutôt
qu'au contenu). Recherche (par e-mail, ou plein texte + plage de dates depuis fiche 47
tâche 7) et effacement par adresse e-mail à travers toutes les soumissions — le minimum
qu'exige une demande d'export ou de suppression RGPD.

### Notifications

Réutilisent l'adaptateur e-mail existant de `@cogenta/channels` (jamais un second
transport) et son format `AlertChannelMessage`. L'accusé de réception au visiteur est
**désactivé par défaut** et limité en débit indépendamment de la limite de soumission :
un e-mail envoyé au nom du site vers une adresse fournie par un anonyme, sans plafond,
est un relais de spam en puissance. Depuis la fiche 47 tâche 4, `FormDefinition.notifyChannels`
peut nommer des canaux supplémentaires (Slack/Discord/Telegram/webhook), tous réutilisant
le `ChannelRegistry` déjà existant de `@cogenta/channels` — jamais un second système de
notification.

### Versionnement

`forms@1.1` (ADR-0026 amendement rédigé en ADR-0031, en attente d'insertion humaine, non
figé) — passé de `1.0` par la fiche 47 :
champ `file`, `showIf`, `steps`, `notifyChannels`, `captcha`, notes d'opérateur, tous
additifs, aucune forme existante changée de sens. Ajouter un type de champ ou un statut
de soumission reste
mineur ; changer le sens d'un statut existant ou la forme d'un consentement enregistré
reste majeur.

---

## Format d'export et de sauvegarde (fiche 26)

> **Documenté ici par décision du plan de la fiche 26** (« le format d'export est un
> format public […] le versionner et le documenter dans `docs/04-contrats.md` dès le
> début »), sans passer par le statut de contrat A-E : la fiche ne demande pas d'ADR pour
> cette décision, seulement une décision de format écrite. Deux formats distincts,
> délibérément — un export respecte les permissions et est fait pour circuler, une
> sauvegarde est la base entière et ne l'est pas.

### `export@1.0` — export de contenu

NDJSON : une ligne, un objet JSON, un `ExportRecord`. La première ligne est toujours un
enregistrement `manifest` (`format`, `version`, `site`, `selection`, `counts`) — jamais
un fichier séparé, pour qu'un export ne puisse jamais se retrouver avec un manifeste et
un contenu qui ont divergé. Les lignes suivantes portent, dans cet ordre :
`term` (taxonomies, dans l'ordre de l'arbre), `entry` (collections, dans l'ordre de
dépendance de `orderByDependency`, chaque collection dans son ordre de liste), `version`
(historique, seulement si demandé), `menu`, `menu-item`, `redirect`.

Cet ordre n'est pas cosmétique : un import à passe unique (`importContent`,
`@cogenta/export`) rejoue le flux tel quel, donc tout ce qu'un enregistrement référence
par identifiant (un terme de taxonomie, l'entrée source d'une traduction, l'entrée
cible d'un article de menu) doit avoir été émis avant lui. Une traduction dont la
source apparaîtrait plus tard dans le flux est mise en file d'attente et rejouée à la
fin plutôt que de faire échouer tout l'import.

Un export **respecte les permissions de l'acteur qui le demande** (R4) : la route
`/api/export` construit le même filtre `canReadCollection`/`canReadTaxonomy` que toute
autre lecture, à partir du même `PermissionLayer`. La CLI (`cogenta export`), qui
tourne comme l'opérateur du site, n'a par défaut aucune restriction — c'est
`--collections` qui la borne, jamais un rôle.

Versionnement : mineur pour un nouveau type d'enregistrement ou un champ optionnel
ajouté à un type existant ; majeur pour retirer un champ ou changer le sens d'un champ
existant.

### `cogenta-backup@1.0` — sauvegarde complète

Un fichier ZIP (mode « store », sans compression — R9, `node:zlib`'s `crc32` suffit,
aucune dépendance nouvelle), produit et lu en flux (`@cogenta/export`'s
`zip-writer.ts`/`zip-reader.ts`) : jamais assemblé en mémoire, qu'il s'agisse du contenu
ou d'une archive de médias. Il contient un `<table>.ndjson` (ou `.ndjson.enc` si
chiffré) par table physique — contenu, utilisateurs (mots de passe **hachés**), audit,
médias, menus, redirections et, si le site vend quelque chose, commerce — plus un
`manifest.json` en clair (jamais chiffré : il ne porte que des noms de table, des
comptes de lignes et une somme de contrôle, pas de données personnelles).

La somme de contrôle (`sha256`) porte sur les octets **en clair** de chaque table,
concaténés dans l'ordre du manifeste — calculée pendant que les lignes défilent, jamais
en relisant le fichier fini. Une restauration (`applyRestore`) la revérifie **avant
d'écrire la moindre ligne** ; un fichier corrompu ou modifié après coup est refusé
(`BACKUP_CHECKSUM_MISMATCH`) sans toucher la base cible.

Chiffrement optionnel par phrase de passe : `AES-256-GCM`, clé dérivée par `scrypt`
(profil coûteux exprès — une sauvegarde contient tous les hachages de mots de passe du
site), chiffrement **par table** plutôt que sur l'archive entière, pour que le flux
reste borné en mémoire même chiffré.

L'ordre des tables dans le manifeste est celui d'insertion sûr pour une restauration :
tables hors contenu fournies par l'appelant (`before` — utilisateurs, médias), termes de
taxonomie, tables de contenu par collection en ordre de dépendance (entrées, versions,
blocs, jointures de relation), puis tables hors contenu fournies par l'appelant
(`after` — menus, redirections, commerce). `@cogenta/export` ne connaît lui-même ni
`@cogenta/auth`, ni `@cogenta/commerce`, ni la table de médias de `@cogenta/core` — cet
ordre est assemblé par l'appelant (`cogenta backup`, `packages/cli`), qui seul dépend de
tout cela.

**La restauration complète n'est jamais exposée par l'API admin, seulement par la
CLI** (`cogenta restore` — voir la fiche 26, tâche 4, et son piège nommé : une
restauration réécrit la base sur laquelle l'admin qui l'aurait déclenchée tourne
lui-même). L'admin peut appliquer un **export de contenu** (`importContent`), additif et
réversible par la corbeille — jamais une sauvegarde complète.

Versionnement : mineur pour une table supplémentaire ou un champ ajouté au manifeste ;
majeur pour changer le sens du chiffrement ou de la somme de contrôle.
