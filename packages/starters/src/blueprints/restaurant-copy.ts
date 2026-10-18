/**
 * The words of the `restaurant` blueprint, in each language it ships in.
 *
 * The site is a bistro in Lyon: a seasonal menu of nineteen dishes and wines,
 * and the pages a restaurant needs before a guest arrives. Every
 * visitor-facing string lives here, typed once and written twice (`fr`,
 * `en`), so the French site is written in French rather than translated at
 * render time, and a missing sentence in one language is a type error rather
 * than a blank on a page.
 *
 * `name` is what the person called their site (`SeedContext.siteName`): the
 * copy names their restaurant, never a fictional one, whenever one is known.
 */

export type RestaurantLocale = 'fr' | 'en'

/** The pages the blueprint seeds, by role; `pageSlugs` gives each its address. */
export type RestaurantPageKey =
  | 'home'
  | 'menu'
  | 'story'
  | 'reservations'
  | 'privateDining'
  | 'visit'
  | 'legal'
  | 'credits'

/** One dish or wine of the menu, printed in the order the menu lists them. */
export interface RestaurantDishCopy {
  /** Stable across languages: names the photograph and the media slot. */
  readonly id: string
  readonly slug: string
  readonly name: string
  /** Index into `sections`. */
  readonly section: 0 | 1 | 2 | 3
  readonly price: number
  readonly vegetarian: boolean
  readonly description: string
  readonly sourcing: string
  /** The name of a wine of the same menu. */
  readonly pairing?: string
  readonly allergens?: string
  /** A note from the kitchen or the cellar, printed on the dish's own page. */
  readonly note: string
  /** Present when the dish has a photograph; says what it shows. */
  readonly photoAlt?: string
}

/** A line of a ruled table: a label and what it says, optionally a link. */
export interface RestaurantRow {
  readonly title: string
  readonly text: string
  readonly href?: string
}

export interface RestaurantTier {
  readonly name: string
  readonly price: string
  readonly interval: string
  readonly features: readonly string[]
  readonly highlighted?: boolean
}

export type RestaurantQuestions = readonly (readonly [string, string])[]

/**
 * What a page's words may point at: the pages of the same site, in the
 * language's own addresses, and the two links a restaurant always has.
 */
export interface RestaurantPageContext {
  /** The restaurant's name, as the person typed it. */
  readonly name: string
  /** `table@laurier.fr`, `events@laurier.fr`: the restaurant's own mailboxes. */
  readonly email: (mailbox: 'table' | 'events' | 'hello') => string
  readonly href: (page: RestaurantPageKey) => string
  readonly phoneHref: string
  readonly mapHref: string
}

export interface RestaurantPagesCopy {
  readonly titles: Readonly<Record<RestaurantPageKey, string>>
  /** Lunch, dinner, closed: printed on the home page and on the hours page. */
  readonly hours: readonly RestaurantRow[]
  readonly labels: {
    readonly address: string
    readonly telephone: string
  }
  readonly actions: {
    /** `Call +33 4 78 28 16 42`. */
    readonly call: string
    readonly write: string
    readonly tableSubject: string
    readonly eventsSubject: string
  }
  readonly home: {
    readonly heroEyebrow: string
    readonly heroSubtitle: string
    readonly heroAction: string
    readonly welcome: string
    readonly menuTitle: string
    /** Lines of a prose block: `## ` opens a heading, `[words](href)` a link. */
    readonly kitchen: readonly string[]
    readonly press: {
      readonly text: string
      readonly author: string
      readonly role: string
    }
    readonly hoursTitle: string
    readonly privateCta: {
      readonly title: string
      readonly text: string
      readonly action: string
    }
    readonly bookCta: { readonly title: string; readonly text: string }
  }
  readonly menu: {
    readonly intro: string
    readonly setsTitle: string
    readonly tiers: readonly RestaurantTier[]
    readonly listTitle: string
    readonly notesTitle: string
    readonly notes: RestaurantQuestions
  }
  readonly story: {
    readonly intro: readonly string[]
    readonly roomCaption: string
    readonly figuresTitle: string
    readonly figures: readonly {
      readonly value: string
      readonly unit?: string
      readonly label: string
    }[]
    readonly suppliersTitle: string
    readonly suppliers: readonly RestaurantRow[]
    readonly marketCaption: string
  }
  readonly reservations: {
    readonly intro: readonly string[]
    readonly summaryTitle: string
    readonly summary: readonly RestaurantRow[]
    readonly faqTitle: string
    readonly faq: RestaurantQuestions
    readonly cta: { readonly title: string; readonly text: string }
  }
  readonly privateDining: {
    readonly intro: readonly string[]
    readonly menusTitle: string
    readonly tiers: readonly RestaurantTier[]
    readonly testimonial: {
      readonly quote: string
      readonly name: string
      readonly role: string
    }
    readonly faqTitle: string
    readonly faq: RestaurantQuestions
    readonly cta: { readonly title: string; readonly text: string }
  }
  readonly visit: {
    readonly hoursTitle: string
    /** Rows printed after lunch, dinner and closed. */
    readonly extraHours: readonly RestaurantRow[]
    readonly accessTitle: string
    readonly access: readonly RestaurantRow[]
    readonly note: string
    readonly streetCaption: string
  }
  /** Lines of a prose block. */
  readonly legal: readonly string[]
  readonly credits: {
    readonly intro: readonly string[]
    readonly sourceWord: string
  }
}

export interface RestaurantCopy {
  readonly locale: RestaurantLocale
  readonly schema: {
    readonly dishLabels: { readonly singular: string; readonly plural: string }
    /** The address of a dish: `/menu/:slug`, `/carte/:slug`. */
    readonly dishRoute: string
  }
  readonly pageSlugs: Readonly<Record<RestaurantPageKey, string>>
  /** Starters, mains, cheese and desserts, wine by the glass: the stored value of `category`. */
  readonly sections: readonly [string, string, string, string]
  /** The title of the list of a dish's own section, under its note. */
  readonly moreTitles: readonly [string, string, string, string]
  readonly address: string
  /** As printed: `+33 4 78 28 16 42`, `04 78 28 16 42`. */
  readonly phoneDisplay: string
  readonly dishes: readonly RestaurantDishCopy[]
  /** Alternative text of the pictures that are not dishes. */
  readonly media: {
    readonly hero: string
    readonly street: string
    readonly market: string
  }
  readonly pages: (context: RestaurantPageContext) => RestaurantPagesCopy
  readonly menus: {
    readonly header: readonly {
      readonly label: string
      readonly page: RestaurantPageKey
    }[]
    readonly footer: readonly {
      readonly label: string
      readonly page: RestaurantPageKey
    }[]
    readonly action: { readonly label: string; readonly page: RestaurantPageKey }
  }
  readonly settings: {
    readonly tagline: string
    /** The address card printed in the footer. */
    readonly footerNote: string
  }
  readonly widgets: {
    readonly reservations: {
      readonly title: string
      readonly heading: string
      readonly body: string
      readonly label: string
    }
    readonly goodToKnow: {
      readonly title: string
      readonly hours: readonly { readonly label: string; readonly value: string }[]
    }
    readonly privateDining: {
      readonly title: string
      readonly heading: string
      readonly body: string
      readonly label: string
    }
  }
}
