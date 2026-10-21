import { CogentaError } from '@cogenta/core'
import type { SkinTokens } from '@cogenta/render'
import {
  type CollectionDefinition,
  normalisePermissionRule,
  type TaxonomyDefinition,
} from '@cogenta/schema'
import type { DemoEntry, ProposedPage, SitePlanDraft } from './types.js'

/**
 * L19 task 5's rule, made structural: "validation section par section,
 * jamais une case « tout accepter » qui masque le détail."
 *
 * There is no "accept everything" here, and there cannot be one bolted on
 * later without changing this file: `resolveApprovedPlan` refuses unless
 * **every** item carries its own explicit decision, and refuses again if it
 * is handed a decision for an item that is not in the plan. A caller — a
 * CLI prompt loop, an admin screen, an API client — has to walk the items.
 * Whether the UI above it renders one screen or five is its business; what
 * it cannot do is skip an item.
 *
 * Nothing here applies anything. It turns a draft plus decisions into an
 * `ApprovedPlan`: the subset the human said yes to. Writing that subset to a
 * schema file, a database or a theme is the caller's separate, later act
 * (R6 — "rien n'est jamais appliqué automatiquement").
 */

export const PLAN_SECTIONS = [
  'brief',
  'contentModel',
  'taxonomies',
  'pages',
  'structuralGaps',
  'skin',
  'demoContent',
] as const
export type PlanSectionId = (typeof PLAN_SECTIONS)[number]

export type PlanItemDecision = 'accepted' | 'rejected'

/** A taxonomy's labels are indexed by locale; a reviewer wants a word, not a map. */
function labelOf(labels: Readonly<Record<string, string>> | undefined): string | undefined {
  if (labels === undefined) return undefined
  return Object.values(labels)[0]
}

export interface PlanItem {
  /** Stable within a draft: `section:key`. */
  readonly id: string
  readonly section: PlanSectionId
  readonly title: string
  /** Everything the human needs to judge it, in plain words. */
  readonly detail: string
}

export interface PlanSection {
  readonly id: PlanSectionId
  readonly title: string
  readonly description: string
  /** `'each'`: every item is judged on its own. `'one-of'`: exactly one item may be accepted. */
  readonly mode: 'each' | 'one-of'
  readonly items: readonly PlanItem[]
}

export type PlanDecisions = Readonly<Record<string, PlanItemDecision>>

export interface ApprovedPlan {
  readonly draftId: string
  readonly decidedAt: string
  readonly locales: readonly string[]
  /** Only the constraints the human confirmed. */
  readonly constraints: readonly { readonly quote: string; readonly source: string }[]
  readonly collections: readonly CollectionDefinition[]
  /**
   * Taxonomies the human accepted.
   *
   * A collection field that names one is only as accepted as the taxonomy
   * itself: accepting a collection whose `taxonomy` field points at a
   * refused taxonomy would create a dangling reference, which is why the
   * caller applies these before the collections that use them.
   */
  readonly taxonomies: readonly TaxonomyDefinition[]
  readonly pages: readonly ProposedPage[]
  readonly skinId?: string
  readonly skin?: SkinTokens
  readonly demoContent: readonly DemoEntry[]
  /** Item ids the human said no to — kept so a report can say what was refused, not only what was kept. */
  readonly rejected: readonly string[]
}

function constraintItemId(index: number): string {
  return `brief:constraint-${index}`
}

const LOCALES_ITEM_ID = 'brief:locales'

/**
 * The plan, flattened into the units a human decides on.
 *
 * The `brief` section carries the constraints because they are the part of
 * the analysis most worth a second pair of eyes: they were read out of the
 * document by pattern, and a pattern can misread. Note what un-confirming
 * one does and does not do — it drops the constraint from the approved plan,
 * so a later re-proposal is not bound by it; it does not resurrect anything
 * already removed from this draft, which was removed before the human ever
 * saw it. `SitePlanDraft.violations` says what that was.
 */
export function summarisePlan(draft: SitePlanDraft, locale?: string): readonly PlanSection[] {
  const text = planText(locale)
  const constraintItems: PlanItem[] = draft.brief.constraints.map((constraint, index) => ({
    id: constraintItemId(index),
    section: 'brief' as const,
    title:
      constraint.kind === 'language'
        ? text.onlyLanguages((constraint.locales ?? []).join(', '))
        : constraint.kind === 'exclusion'
          ? text.exclusion(constraint.topic)
          : text.requirement(constraint.topic),
    detail: text.readFrom(constraint.source, constraint.quote),
  }))

  return [
    {
      id: 'brief',
      title: text.briefTitle,
      description: text.briefDescription(
        draft.brief.activity,
        draft.brief.audience,
        draft.brief.tone,
      ),
      mode: 'each',
      items: [
        {
          id: LOCALES_ITEM_ID,
          section: 'brief',
          title: text.languages(draft.brief.languages.join(', ')),
          detail: text.languagesDetail,
        },
        ...constraintItems,
      ],
    },
    {
      id: 'contentModel',
      title: text.contentModelTitle,
      description: text.contentModelDescription,
      mode: 'each',
      items: draft.contentModel.collections.map((collection) => ({
        id: `contentModel:${collection.definition.name}`,
        section: 'contentModel' as const,
        title: `${collection.definition.labels.plural} (${collection.definition.name})`,
        detail: `${collection.rationale} ${text.fields(
          Object.entries(collection.definition.fields)
            .map(([name, field]) => text.fieldLabel(name, field.kind, field.admin?.label))
            .join(', '),
        )} ${text.permissions(describePermissions(collection.definition.permissions, text))}${
          collection.definition.routing === undefined
            ? ''
            : ` ${text.routedAt(collection.definition.routing.pattern)}`
        }`,
      })),
    },
    {
      id: 'taxonomies',
      title: text.taxonomiesTitle,
      description: text.taxonomiesDescription,
      mode: 'each',
      items: (draft.contentModel.taxonomies ?? []).map((taxonomy) => ({
        id: `taxonomies:${taxonomy.definition.name}`,
        section: 'taxonomies' as const,
        title: `${labelOf(taxonomy.definition.labels.plural) ?? taxonomy.definition.name} (${taxonomy.definition.name})`,
        detail: `${taxonomy.rationale} ${
          taxonomy.definition.hierarchical === true ? text.termsNested : text.termsFlat
        } ${text.permissions(describePermissions(taxonomy.definition.permissions, text))}`,
      })),
    },
    {
      id: 'pages',
      title: text.pagesTitle,
      description: text.pagesDescription,
      mode: 'each',
      items: draft.pages.map((page) => ({
        id: `pages:${page.slug}`,
        section: 'pages' as const,
        title: `${page.title} (/${page.slug})`,
        detail: page.purpose,
      })),
    },
    {
      id: 'structuralGaps',
      title: text.gapsTitle,
      description: text.gapsDescription,
      mode: 'each',
      items: draft.structuralGaps.map((gap) => ({
        id: `structuralGaps:${gap.id}`,
        section: 'structuralGaps' as const,
        title: `${gap.title} (/${gap.slug})`,
        detail: gap.reason,
      })),
    },
    {
      id: 'skin',
      title: text.skinTitle,
      description: text.skinDescription,
      mode: 'one-of',
      items: draft.skins.map((skin) => {
        const localised = text.skin(skin.id, skin.label, skin.rationale)
        return {
          id: `skin:${skin.id}`,
          section: 'skin' as const,
          title: localised.label,
          detail: localised.rationale,
        }
      }),
    },
    {
      id: 'demoContent',
      title: text.demoTitle,
      description: text.demoDescription,
      mode: 'each',
      items: draft.demoContent.map((entry, index) => ({
        id: `demoContent:${index}`,
        section: 'demoContent' as const,
        title: `${entry.collection}: ${String(entry.values.title ?? entry.values.name ?? text.entryFallback(index + 1))}`,
        detail: Object.entries(entry.values)
          .map(([key, value]) => `${text.fieldName(key)}: ${demoValue(value)}`)
          .join(' · '),
      })),
    },
  ]
}

/** A demonstration value in a form a reviewer reads: plain strings unquoted, structures as JSON. */
function demoValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/**
 * The wording of the review screen, per language. English is the default (the
 * installer prints it); French is what the admin asks for on a French site.
 * Anything the model wrote — a rationale, a page purpose — is shown as it
 * came, in whichever language the brief was in.
 */
interface PlanText {
  readonly briefTitle: string
  briefDescription(activity: string, audience: string, tone: string): string
  languages(list: string): string
  readonly languagesDetail: string
  onlyLanguages(list: string): string
  exclusion(topic: string | undefined): string
  requirement(topic: string | undefined): string
  readFrom(source: string, quote: string): string
  readonly contentModelTitle: string
  readonly contentModelDescription: string
  fields(list: string): string
  fieldLabel(name: string, kind: string, label: string | undefined): string
  fieldName(name: string): string
  permissions(list: string): string
  routedAt(pattern: string): string
  readonly taxonomiesTitle: string
  readonly taxonomiesDescription: string
  readonly termsNested: string
  readonly termsFlat: string
  readonly pagesTitle: string
  readonly pagesDescription: string
  readonly gapsTitle: string
  readonly gapsDescription: string
  readonly skinTitle: string
  readonly skinDescription: string
  skin(id: string, label: string, rationale: string): { label: string; rationale: string }
  readonly demoTitle: string
  readonly demoDescription: string
  entryFallback(position: number): string
  readonly noneGranted: string
  action(name: string): string
  readonly ownOnly: string
}

const ENGLISH_PLAN_TEXT: PlanText = {
  briefTitle: 'What we understood',
  briefDescription: (activity, audience, tone) => `${activity} — for ${audience}. Tone: ${tone}.`,
  languages: (list) => `Languages: ${list}`,
  languagesDetail: 'The locales the site will be set up with.',
  onlyLanguages: (list) => `Only these languages: ${list}`,
  exclusion: (topic) => `No ${topic ?? 'this'}`,
  requirement: (topic) => `Must have ${topic ?? 'this'}`,
  readFrom: (source, quote) => `Read from ${source}: “${quote}”`,
  contentModelTitle: 'Content model',
  contentModelDescription:
    'The collections the site would be created with. Each is judged on its own.',
  fields: (list) => `Fields: ${list}.`,
  fieldLabel: (name, kind) => `${name} (${kind})`,
  fieldName: (name) => name,
  permissions: (list) => `Permissions: ${list}.`,
  routedAt: (pattern) => `Routed at ${pattern}.`,
  taxonomiesTitle: 'Taxonomies',
  taxonomiesDescription:
    'How content is classified — categories, tags. Each is judged on its own, and a collection field that names one is only as accepted as the taxonomy itself.',
  termsNested: 'Terms can be nested.',
  termsFlat: 'Terms are a flat list.',
  pagesTitle: 'Pages',
  pagesDescription: 'The standing pages the brief asks for.',
  gapsTitle: 'Suggested standing pages',
  gapsDescription:
    'Pages many sites need that this plan does not yet cover. Nothing here is created unless you accept it.',
  skinTitle: 'Design',
  skinDescription: 'Pick one of the proposed designs. They are alternatives, not a checklist.',
  skin: (_id, label, rationale) => ({ label, rationale }),
  demoTitle: 'Demonstration content',
  demoDescription: 'Starter entries, so the site is not empty on first sight. Edit or delete later.',
  entryFallback: (position) => `entry ${position}`,
  noneGranted: 'none granted',
  action: (name) => name,
  ownOnly: ' (own only)',
}

const FRENCH_FIELD_NAMES: Readonly<Record<string, string>> = {
  title: 'Titre',
  name: 'Nom',
  slug: 'Identifiant d’URL',
  body: 'Contenu',
  content: 'Contenu',
  summary: 'Résumé',
  excerpt: 'Extrait',
  description: 'Description',
  image: 'Image',
  coverImage: 'Image de couverture',
  photo: 'Photo',
  author: 'Auteur',
  category: 'Catégorie',
  tags: 'Étiquettes',
  date: 'Date',
  publishedAt: 'Date de publication',
  price: 'Prix',
  url: 'Adresse',
  link: 'Lien',
  email: 'Adresse e-mail',
  phone: 'Téléphone',
  address: 'Adresse',
  location: 'Lieu',
  role: 'Fonction',
  company: 'Entreprise',
  quote: 'Citation',
  subtitle: 'Sous-titre',
  order: 'Ordre',
  blocks: 'Blocs',
  seoTitle: 'Titre SEO',
  seoDescription: 'Méta-description',
}

const FRENCH_FIELD_KINDS: Readonly<Record<string, string>> = {
  text: 'texte',
  richText: 'texte riche',
  slug: 'identifiant d’URL',
  number: 'nombre',
  boolean: 'oui/non',
  date: 'date',
  datetime: 'date et heure',
  media: 'média',
  relation: 'lien vers un contenu',
  select: 'choix',
  json: 'données structurées',
  geo: 'position',
  color: 'couleur',
  blocks: 'blocs',
  taxonomy: 'classement',
}

const FRENCH_ACTIONS: Readonly<Record<string, string>> = {
  read: 'lecture',
  create: 'création',
  update: 'modification',
  delete: 'suppression',
  publish: 'publication',
}

const FRENCH_ROLES: Readonly<Record<string, string>> = {
  public: 'public',
  admin: 'administrateur',
  editor: 'éditeur',
  author: 'auteur',
  viewer: 'lecteur',
}

/** The five designs a site plan offers, in French — the model only ever sees the English directions. */
const FRENCH_SKINS: Readonly<Record<string, { label: string; rationale: string }>> = {
  editorial: {
    label: 'Éditorial chaleureux',
    rationale:
      'Chaleureux et éditorial : une échelle typographique généreuse, un fond papier plutôt que blanc pur, un seul accent mesuré, une densité confortable.',
  },
  clinical: {
    label: 'Net et clinique',
    rationale:
      'Net et clinique : une palette quasi neutre, une échelle typographique resserrée, une densité compacte, un accent froid utilisé avec parcimonie, des angles vifs.',
  },
  bold: {
    label: 'Audacieux et graphique',
    rationale:
      'Audacieux et graphique : un accent très saturé, une grande échelle typographique aux écarts marqués, des rayons généreux, un contraste élevé partout.',
  },
  quiet: {
    label: 'Calme et minimal',
    rationale:
      'Calme et minimal : presque monochrome, très peu de chroma, des espacements larges, une petite échelle typographique, presque aucun arrondi, un minimum de mouvement.',
  },
  classic: {
    label: 'Classique et sobre',
    rationale:
      'Classique et sobre : des tons neutres profonds, une échelle typographique prudente, des titres en empattement, une densité modérée, un accent discret.',
  },
}

const FRENCH_PLAN_TEXT: PlanText = {
  briefTitle: 'Ce que nous avons compris',
  briefDescription: (activity, audience, tone) => `${activity} — pour ${audience}. Ton : ${tone}.`,
  languages: (list) => `Langues : ${list}`,
  languagesDetail: 'Les langues dans lesquelles le site sera configuré.',
  onlyLanguages: (list) => `Uniquement ces langues : ${list}`,
  exclusion: (topic) => `Pas de ${topic ?? 'cet élément'}`,
  requirement: (topic) => `Doit comporter : ${topic ?? 'cet élément'}`,
  readFrom: (source, quote) => `Lu dans ${source} : « ${quote} »`,
  contentModelTitle: 'Modèle de contenu',
  contentModelDescription:
    'Les collections avec lesquelles le site serait créé. Chacune est jugée séparément.',
  fields: (list) => `Champs : ${list}.`,
  fieldLabel: (name, kind, label) =>
    `${label ?? FRENCH_FIELD_NAMES[name] ?? name} (${FRENCH_FIELD_KINDS[kind] ?? kind})`,
  fieldName: (name) => FRENCH_FIELD_NAMES[name] ?? name,
  permissions: (list) => `Droits : ${list}.`,
  routedAt: (pattern) => `Adresse : ${pattern}.`,
  taxonomiesTitle: 'Classements',
  taxonomiesDescription:
    'La façon de classer le contenu : catégories, étiquettes. Chacun est jugé séparément, et un champ de collection qui en utilise un n’est accepté que si le classement l’est aussi.',
  termsNested: 'Les termes peuvent être imbriqués.',
  termsFlat: 'Les termes forment une liste à plat.',
  pagesTitle: 'Pages',
  pagesDescription: 'Les pages permanentes que le cahier des charges demande.',
  gapsTitle: 'Pages permanentes suggérées',
  gapsDescription:
    'Des pages dont beaucoup de sites ont besoin et que ce plan ne couvre pas encore. Rien n’est créé sans votre accord.',
  skinTitle: 'Design',
  skinDescription: 'Choisissez l’un des designs proposés. Ce sont des alternatives, pas une liste à cocher.',
  skin: (id, label, rationale) => FRENCH_SKINS[id] ?? { label, rationale },
  demoTitle: 'Contenu de démonstration',
  demoDescription:
    'Des entrées de départ, pour que le site ne soit pas vide au premier regard. À modifier ou supprimer ensuite.',
  entryFallback: (position) => `entrée ${position}`,
  noneGranted: 'aucun',
  action: (name) => FRENCH_ACTIONS[name] ?? name,
  ownOnly: ' (les siennes seulement)',
}

function planText(locale: string | undefined): PlanText {
  return locale !== undefined && locale.toLowerCase().startsWith('fr')
    ? FRENCH_PLAN_TEXT
    : ENGLISH_PLAN_TEXT
}

/**
 * Renders a collection's permissions in plain words, for the review screen.
 *
 * `permissions` is entirely the model's own choice — nothing in the brief
 * names a role — so a legitimate-but-surprising grant (`read: ['public']` on
 * something that sounds sensitive) is exactly the kind of thing a human
 * reviewer needs to see before accepting, not just the collections and
 * fields. `buildCollection` already refuses the unsafe case (`public`
 * granted `create`/`update`/`delete`) outright; this is the second half of
 * the fix — what remains after that refusal is still shown, never hidden
 * inside a rationale sentence that never mentioned it.
 */
function describePermissions(permissions: CollectionDefinition['permissions'], text: PlanText): string {
  const entries = Object.entries(permissions)
    .map(([action, rule]) => [action, normalisePermissionRule(rule)] as const)
    .filter(([, rule]) => rule.roles.length > 0)
  if (entries.length === 0) return text.noneGranted
  return entries
    .map(
      ([action, rule]) =>
        `${text.action(action)}: ${rule.roles
          .map((role) => (text === FRENCH_PLAN_TEXT ? (FRENCH_ROLES[role] ?? role) : role))
          .join(', ')}${rule.own ? text.ownOnly : ''}`,
    )
    .join('; ')
}

function allItems(sections: readonly PlanSection[]): readonly PlanItem[] {
  return sections.flatMap((section) => section.items)
}

/**
 * Turns decisions into the plan the human actually approved.
 *
 * Refuses rather than assumes, twice over: an item with no decision is
 * `SITE_PLAN_DECISION_MISSING` naming every one of them, and a decision for
 * an id that is not in the plan is `SITE_PLAN_DECISION_UNKNOWN_ITEM`. The
 * second is what stops a caller from inventing a blanket `{"*": "accepted"}`
 * and calling it consent.
 */
export function resolveApprovedPlan(
  draft: SitePlanDraft,
  decisions: PlanDecisions,
  now: () => Date = () => new Date(),
): ApprovedPlan {
  const sections = summarisePlan(draft)
  const items = allItems(sections)
  const known = new Set(items.map((item) => item.id))

  const unknown = Object.keys(decisions).filter((id) => !known.has(id))
  if (unknown.length > 0) {
    throw new CogentaError({
      code: 'SITE_PLAN_DECISION_UNKNOWN_ITEM',
      message: `${unknown.length} decision(s) refer to nothing in this plan: ${unknown.join(', ')}.`,
      hint: 'Decide on the item ids `summarisePlan` returned. There is no blanket "accept everything" id, deliberately.',
      details: { unknown },
    })
  }

  const undecided = items.filter((item) => decisions[item.id] === undefined).map((item) => item.id)
  if (undecided.length > 0) {
    throw new CogentaError({
      code: 'SITE_PLAN_DECISION_MISSING',
      message: `${undecided.length} item(s) of this plan have no decision: ${undecided.join(', ')}.`,
      hint: 'Every proposed item must be accepted or rejected explicitly before a plan can be applied — that is what makes this a review rather than a rubber stamp.',
      details: { undecided },
    })
  }

  for (const section of sections) {
    if (section.mode !== 'one-of') continue
    const accepted = section.items.filter((item) => decisions[item.id] === 'accepted')
    if (accepted.length > 1) {
      throw new CogentaError({
        code: 'SITE_PLAN_DECISION_UNKNOWN_ITEM',
        message: `The "${section.title}" section takes one choice, but ${accepted.length} were accepted.`,
        hint: 'Accept exactly one of the proposed designs and reject the others.',
        details: { section: section.id, accepted: accepted.map((item) => item.id) },
      })
    }
  }

  const accepted = (id: string): boolean => decisions[id] === 'accepted'

  const chosenSkin = draft.skins.find((skin) => accepted(`skin:${skin.id}`))
  const keptConstraints = draft.brief.constraints
    .map((constraint, index) => ({ constraint, index }))
    .filter(({ index }) => accepted(constraintItemId(index)))
    .map(({ constraint }) => ({ quote: constraint.quote, source: constraint.source }))
  // Fiche 60 task 5: an accepted suggestion joins the same `pages` a
  // human already reviews and applies exactly the same way — its own
  // section only exists so it is judged on its own, not blended in silently.
  const acceptedGapPages: ProposedPage[] = draft.structuralGaps
    .filter((gap) => accepted(`structuralGaps:${gap.id}`))
    .map((gap) => ({ title: gap.title, slug: gap.slug, purpose: gap.reason }))

  return {
    draftId: draft.id,
    decidedAt: now().toISOString(),
    locales: accepted(LOCALES_ITEM_ID) ? draft.brief.languages : [],
    constraints: keptConstraints,
    collections: draft.contentModel.collections
      .filter((collection) => accepted(`contentModel:${collection.definition.name}`))
      .map((collection) => collection.definition),
    taxonomies: (draft.contentModel.taxonomies ?? [])
      .filter((taxonomy) => accepted(`taxonomies:${taxonomy.definition.name}`))
      .map((taxonomy) => taxonomy.definition),
    pages: [...draft.pages.filter((page) => accepted(`pages:${page.slug}`)), ...acceptedGapPages],
    ...(chosenSkin === undefined ? {} : { skinId: chosenSkin.id, skin: chosenSkin.tokens }),
    demoContent: draft.demoContent.filter((_entry, index) => accepted(`demoContent:${index}`)),
    rejected: items.filter((item) => decisions[item.id] === 'rejected').map((item) => item.id),
  }
}
