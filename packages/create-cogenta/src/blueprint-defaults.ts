import { BLUEPRINT_CONTENT_PACKS } from './blueprints/content-packs.js'
import { BLUEPRINTS } from './blueprints/registry.js'

/**
 * L19 task 8 — "quand l'utilisateur ne téléverse rien, garder et enrichir ce
 * qui existe déjà (le choix « Site type » du wizard, déjà réel, mappé sur les
 * neuf blueprints) — ajouter des paramètres par défaut sensés par type de
 * site que l'utilisateur valide au fur et à mesure plutôt que de tout
 * redéfinir à la main."
 *
 * Two rules govern what is in here, and they are why the list is short.
 *
 * **Every setting must do something real.** A "shopping cart: off" toggle
 * for a portfolio would read well and change nothing — this repository has
 * no commerce domain (L15 is planned, not built), and a switch that writes
 * no config and creates no collection is a lie told in a friendly voice. So
 * the settings here are exactly the ones the scaffolder already acts on:
 * the security block of `cogenta.config.mjs`, the site's locale list, and
 * whether the blueprint's demo content is seeded.
 *
 * **Every setting is confirmed one at a time.** "Validables au fur et à
 * mesure" is the phrase the lot uses, and it is the same rule as the site
 * plan's review: a recommendation is a default in a question, never a
 * decision already taken.
 */

export interface BlueprintSetting {
  readonly id: string
  /** Asked as a yes/no, with `recommended` as the default answer. */
  readonly question: string
  /** Why this is the recommendation for this kind of site. Shown with the question. */
  readonly why: string
  readonly recommended: boolean
}

export interface BlueprintSettings {
  readonly blueprintId: string
  readonly settings: readonly BlueprintSetting[]
  /** How long a public page may be cached, in seconds — written into `security.pageMaxAge`. */
  readonly pageMaxAge: number
}

/** What each setting id turns into once confirmed. */
export interface ConfirmedBlueprintSettings {
  readonly seedDemoContent: boolean
  readonly pageMaxAge: number
  readonly hstsMaxAge: number
}

/**
 * Page cache lifetime, per kind of site.
 *
 * Not one number for everyone: a documentation site changes weekly and a
 * magazine changes hourly, and `security.pageMaxAge` is the one performance
 * knob that costs nothing to set correctly at install time and is annoying
 * to discover later.
 */
const PAGE_MAX_AGE: Readonly<Record<string, number>> = {
  blank: 60,
  vitrine: 900,
  blog: 300,
  magazine: 120,
  portfolio: 900,
  documentation: 1800,
  association: 600,
  restaurant: 900,
  saas: 600,
  store: 120,
}

const CACHE_REASON: Readonly<Record<string, string>> = {
  blank: 'nothing is known about how often this site will change yet',
  vitrine: 'a showcase site changes rarely, so pages can be cached for a quarter of an hour',
  blog: 'posts appear often enough that five minutes is the safe ceiling',
  magazine: 'a magazine publishes through the day, so two minutes keeps the front page honest',
  portfolio: 'a portfolio changes a few times a year',
  documentation: 'documentation changes in batches, and half an hour of caching costs nothing',
  association: 'events and announcements appear weekly',
  restaurant: 'a menu changes on its own schedule, not by the minute',
  saas: 'pricing and feature pages change with releases, not continuously',
  store: 'stock and prices can change through the day, so two minutes keeps the catalogue honest',
}

export function blueprintSettings(blueprintId: string): BlueprintSettings {
  const known = BLUEPRINTS.some((entry) => entry.id === blueprintId)
  const id = known ? blueprintId : 'blank'
  const hasPack = BLUEPRINT_CONTENT_PACKS[id] !== undefined
  const pageMaxAge = PAGE_MAX_AGE[id] ?? 60

  const settings: BlueprintSetting[] = []

  if (hasPack) {
    settings.push({
      id: 'seedDemoContent',
      question: 'Seed this site type’s demonstration content?',
      why: 'A site with a few real-looking entries is far easier to judge than an empty one. Everything seeded can be edited or deleted afterwards.',
      recommended: true,
    })
  }

  settings.push({
    id: 'pageCache',
    question: `Cache public pages for ${pageMaxAge} seconds?`,
    why: `Recommended for this kind of site because ${CACHE_REASON[id] ?? 'it balances freshness against load'}. Answering no sets the cache to zero, which is slower but always fresh.`,
    recommended: true,
  })

  settings.push({
    id: 'hsts',
    question: 'Send HSTS (force HTTPS for a year) once the site is on a real domain?',
    why: 'Off by default, and deliberately: HSTS on a host that is not fully HTTPS yet locks browsers out of it for a year with no way to undo it from the server. Say yes only if this site is already served over HTTPS everywhere.',
    recommended: false,
  })

  return { blueprintId: id, settings, pageMaxAge }
}

/** Applies confirmed answers, falling back to the recommendation for anything unanswered. */
export function resolveBlueprintSettings(
  blueprintId: string,
  answers: Readonly<Record<string, boolean>>,
): ConfirmedBlueprintSettings {
  const defaults = blueprintSettings(blueprintId)
  const answerFor = (id: string): boolean =>
    answers[id] ?? defaults.settings.find((setting) => setting.id === id)?.recommended ?? false

  return {
    seedDemoContent:
      defaults.settings.some((setting) => setting.id === 'seedDemoContent') &&
      answerFor('seedDemoContent'),
    pageMaxAge: answerFor('pageCache') ? defaults.pageMaxAge : 0,
    hstsMaxAge: answerFor('hsts') ? 31_536_000 : 0,
  }
}

/**
 * Which blueprint a brief points at, read from the brief rather than from
 * the model — the same principle as the constraint scanner. Returns
 * `undefined` when nothing matches clearly, and `undefined` means "ask the
 * question with its usual default", never "pick one anyway".
 */
export function inferBlueprint(input: {
  readonly activity: string
  readonly contentTypes: readonly { readonly name: string }[]
}): string | undefined {
  const haystack = [input.activity, ...input.contentTypes.map((type) => type.name)]
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

  const rules: readonly { readonly id: string; readonly pattern: RegExp }[] = [
    {
      id: 'restaurant',
      pattern: /\b(restaurant|bistro|brasserie|traiteur|menu|carte|plat|dish)\b/,
    },
    {
      id: 'store',
      pattern:
        /\b(boutique|e-commerce|ecommerce|commerce en ligne|online store|webshop|web shop|vendre en ligne|shopping cart|panier|checkout)\b/,
    },
    {
      id: 'portfolio',
      pattern:
        /\b(portfolio|photographe|photographer|designer|graphiste|illustrateur|projet|project)\b/,
    },
    {
      id: 'documentation',
      pattern: /\b(documentation|docs|manuel|handbook|guide|api reference)\b/,
    },
    {
      id: 'association',
      pattern: /\b(association|nonprofit|asbl|loi 1901|benevole|adherent|club)\b/,
    },
    { id: 'saas', pattern: /\b(saas|logiciel|software|plateforme|platform|abonnement|pricing)\b/ },
    { id: 'magazine', pattern: /\b(magazine|redaction|rubrique|editorial|journal)\b/ },
    { id: 'blog', pattern: /\b(blog|article|post|billet)\b/ },
    {
      id: 'vitrine',
      pattern: /\b(vitrine|showcase|cabinet|agence|agency|artisan|consulting|conseil|service)\b/,
    },
  ]

  return rules.find((rule) => rule.pattern.test(haystack))?.id
}
