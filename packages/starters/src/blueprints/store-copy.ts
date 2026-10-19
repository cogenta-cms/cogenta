/**
 * The words of the `store` blueprint, in each language it ships in.
 *
 * The site is a small shop in Lyon that sells durable everyday goods from a
 * dozen workshops and repairs what it sells at a bench behind the counter.
 * Every visitor-facing string lives here, typed once and written twice
 * (`fr`, `en`), so the French shop is written in French rather than translated
 * at render time and a missing sentence in one language is a type error rather
 * than a blank on a page.
 *
 * Each product is written for the photograph that stands for it
 * (`assets/photos/store/<key>.jpg`): its material, size and origin describe
 * what the picture shows.
 */

export type StoreLocale = 'fr' | 'en'

/** The three departments of the shop; a product names one, a category page lists it. */
export type StoreCategoryId = 'kitchen' | 'home' | 'carry'

export interface StoreProductCopy {
  /** The photograph's file stem under `assets/photos/store/`, the same in every language. */
  readonly key: string
  readonly slug: string
  readonly name: string
  readonly category: StoreCategoryId
  /** Whole euros, VAT included. */
  readonly price: number
  readonly inStock: boolean
  /** Shown beside the price. 80 to 300 characters. */
  readonly description: string
  readonly material: string
  readonly dimensions: string
  readonly weight?: string
  readonly capacity?: string
  readonly origin: string
  readonly care: string
  readonly delivery: string
  /** Two paragraphs: how it is made, and how it wears. */
  readonly story: readonly [string, string]
  /** What the photograph shows, in a full sentence. */
  readonly alt: string
}

export interface StoreCategoryCopy {
  readonly id: StoreCategoryId
  readonly slug: string
  readonly name: string
  readonly summary: string
  /** The product whose photograph stands for the category: never one of the four on the home page's grid. */
  readonly photoOf: string
  readonly relatedTitle: string
  readonly makers: readonly [string, string]
}

/** The addresses the pages quote, derived from the shop's name. */
export interface StoreFacts {
  readonly name: string
  readonly hello: string
  readonly orders: string
  readonly repairs: string
  readonly letters: string
}

export type StorePageKey =
  | 'home'
  | 'shop'
  | 'about'
  | 'order'
  | 'delivery'
  | 'repairs'
  | 'contact'
  | 'terms'
  | 'credits'

/** A line of prose: `## ` starts a heading, `[words](href)` is a link, anything else a paragraph. */
export type StoreLines = readonly string[]

export type StoreQuestions = readonly (readonly [string, string])[]

export interface StorePagesCopy {
  readonly titles: Readonly<Record<StorePageKey, string>>
  readonly home: {
    readonly heroTitle: string
    readonly heroSubtitle: string
    readonly heroAction: string
    readonly commitments: readonly [
      { readonly title: string; readonly page: StorePageKey },
      { readonly title: string; readonly page: StorePageKey },
      { readonly title: string; readonly page: StorePageKey },
    ]
    readonly newTitle: string
    readonly storyCaption: string
    readonly letter: { readonly quote: string; readonly name: string; readonly role: string }
    readonly faqTitle: string
    readonly faq: StoreQuestions
    readonly lettersTitle: string
    readonly lettersText: string
    readonly lettersAction: string
    /** The subject line of the e-mail that asks for the letters. */
    readonly lettersSubject: string
  }
  readonly about: {
    readonly intro: StoreLines
    readonly figureCaption: string
    readonly figuresTitle: string
    readonly figures: readonly [
      { readonly value: string; readonly label: string },
      { readonly value: string; readonly label: string },
      { readonly value: string; readonly label: string },
    ]
    readonly visitTitle: string
    readonly visitText: string
    readonly visitAction: string
  }
  readonly order: {
    readonly intro: StoreLines
    readonly notesTitle: string
    readonly notes: StoreQuestions
  }
  readonly delivery: {
    readonly intro: StoreLines
    readonly faqTitle: string
    readonly faq: StoreQuestions
  }
  readonly repairs: {
    readonly intro: StoreLines
    readonly figuresTitle: string
    readonly figures: readonly [
      { readonly value: string; readonly label: string },
      { readonly value: string; readonly label: string },
      { readonly value: string; readonly label: string },
    ]
  }
  readonly contact: StoreLines
  readonly terms: StoreLines
  readonly credits: {
    readonly intro: StoreLines
    readonly sourceWord: string
  }
}

export interface StoreCopy {
  readonly locale: StoreLocale
  /** Used when the person gave their site no name. */
  readonly defaultShopName: string
  readonly schema: {
    readonly routes: { readonly product: string; readonly category: string }
    readonly labels: {
      readonly product: { readonly singular: string; readonly plural: string }
      readonly category: { readonly singular: string; readonly plural: string }
    }
  }
  readonly pageSlugs: Readonly<Record<StorePageKey, string>>
  readonly categories: readonly StoreCategoryCopy[]
  /** Oldest first: the last four open the home page's grid. */
  readonly products: readonly StoreProductCopy[]
  readonly media: {
    readonly hero: string
    readonly story: string
  }
  /** The subject of the order e-mail, `{product}` standing for the product's name. */
  readonly orderSubject: string
  readonly pages: (facts: StoreFacts) => StorePagesCopy
  readonly menus: {
    /** The header reads: shop, the three categories, about. */
    readonly shop: string
    readonly about: string
    readonly action: string
    readonly footer: readonly { readonly label: string; readonly page: StorePageKey }[]
  }
  readonly settings: {
    readonly tagline: string
    readonly footerNote: string
  }
  readonly widgets: {
    readonly newTitle: string
    readonly careTitle: string
    /** The customer care list: a label per page. */
    readonly careLabels: Readonly<
      Record<'order' | 'delivery' | 'repairs' | 'contact' | 'terms', string>
    >
    readonly beforeTitle: string
    readonly beforeHeading: string
    readonly beforeBody: string
    readonly beforeLabel: string
    readonly phoneTitle: string
    readonly phone: string
    readonly phoneHoursLabel: string
    readonly phoneHoursValue: string
    readonly lettersTitle: string
    readonly lettersHeading: string
    readonly lettersBody: string
    readonly lettersLabel: string
  }
}
