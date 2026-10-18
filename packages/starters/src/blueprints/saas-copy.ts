/**
 * The words of the `saas` blueprint, in each language it ships in.
 *
 * The site is the marketing site of a B2B software product for finance and
 * operations teams (spend approvals, an audit log, ERP sync). Every
 * visitor-facing string lives in `saas-copy-en.ts` and `saas-copy-fr.ts`, typed
 * once here, so a French site is written in French (French offices, euros,
 * French ERPs and a French telephone number) rather than translated at render
 * time, and a sentence missing in one language is a type error rather than a
 * blank on a page. `saas.ts` builds the blocks from whichever copy the site's
 * locale selects.
 *
 * `name` is the product name the person gave their site
 * (`SeedContext.siteName`); the copy names their product, never a fictional
 * one, whenever one is known.
 */

export type SaasLocale = 'fr' | 'en'

/** A heading, a paragraph or a list, in reading order. */
export type RichPart =
  | { readonly h2: string }
  | { readonly h3: string }
  | { readonly p: string }
  | { readonly ul: readonly string[] }
  | { readonly ol: readonly string[] }

export type SaasPageKey =
  | 'home'
  | 'product'
  | 'pricing'
  | 'security'
  | 'changelog'
  | 'about'
  | 'demo'
  | 'legal'
  | 'privacy'
  | 'credits'

export interface SaasFeatureCopy {
  readonly name: string
  readonly slug: string
  /** The line under the name on the home page grid: two lines at most. */
  readonly short: string
  /** The summary on the product tour and at the top of the feature page. */
  readonly description: string
  readonly icon: string
  /** `SaasMediaCopy.name` of the screenshot. */
  readonly screenshot: string
  readonly body: (name: string) => readonly RichPart[]
  readonly details: readonly (readonly [string, string])[]
}

export interface SaasUpdateCopy {
  readonly title: string
  readonly slug: string
  readonly summary: string
  readonly publishedAt: string
  readonly body: (name: string) => readonly RichPart[]
  /** `SaasMediaCopy.name` of a screenshot shown under the text. */
  readonly screenshot?: string
  readonly caption?: string
}

export interface SaasMediaCopy {
  readonly name: string
  /** File under `assets/photos/saas/`. */
  readonly file: string
  readonly alt: string
}

export interface SaasTierCopy {
  readonly key: string
  readonly name: string
  readonly price: string
  readonly interval: string
  /** `Label: value` lines are rows of the comparison table; any other line is a checked row. */
  readonly features: readonly string[]
  readonly actionLabel: string
  readonly primary?: boolean
  readonly highlighted?: boolean
}

export interface SaasHomeCopy {
  readonly heroEyebrow: string
  readonly heroTitle: string
  readonly heroSubtitle: string
  readonly heroSecondary: string
  readonly customersCaption: string
  readonly featuresTitle: string
  readonly stepsTitle: string
  readonly steps: readonly { readonly title: string; readonly text: string }[]
  readonly tourTitle: string
  readonly figuresTitle: string
  readonly figures: readonly {
    readonly value: string
    readonly unit: string
    readonly label: string
  }[]
  readonly quote: readonly [string, string]
  readonly quoteName: string
  readonly quoteRole: string
  readonly pricingTitle: string
  readonly questionsTitle: string
  readonly ctaTitle: string
  readonly ctaText: string
  readonly ctaSecurity: string
}

export interface SaasPagesCopy {
  readonly titles: Readonly<Record<SaasPageKey, string>>
  /** Label of the main action: "Book a demo". */
  readonly demoAction: string
  readonly home: SaasHomeCopy
  readonly product: {
    readonly heroEyebrow: string
    readonly heroTitle: string
    readonly heroSubtitle: string
    readonly stepsTitle: string
    readonly steps: readonly { readonly title: string; readonly text: string }[]
    readonly ctaTitle: string
    readonly ctaText: string
    readonly ctaCompare: string
  }
  readonly pricing: {
    readonly heroEyebrow: string
    readonly heroTitle: string
    readonly heroSubtitle: string
    readonly trialAction: string
    readonly plansTitle: string
    readonly billingTitle: string
    readonly billing: readonly (readonly [string, string])[]
    readonly ctaTitle: string
    readonly ctaText: string
    readonly ctaEmail: string
  }
  readonly security: {
    readonly heroEyebrow: string
    readonly heroTitle: string
    readonly heroSubtitle: string
    readonly packAction: string
    readonly controlsTitle: string
    readonly controls: readonly {
      readonly icon: string
      readonly title: string
      readonly text: string
    }[]
    readonly detail: readonly RichPart[]
    readonly logCaption: string
    readonly racksCaption: string
    readonly subprocessorsTitle: string
    readonly subprocessors: readonly (readonly [string, string])[]
    readonly ctaTitle: string
    readonly ctaText: string
  }
  readonly changelog: {
    readonly heroEyebrow: string
    readonly heroTitle: string
    readonly heroSubtitle: string
  }
  readonly about: {
    readonly heroEyebrow: string
    readonly heroTitle: string
    readonly heroSubtitle: string
    readonly story: readonly RichPart[]
    readonly numbersTitle: string
    readonly numbers: readonly { readonly value: string; readonly label: string }[]
    readonly places: readonly RichPart[]
    readonly customersTitle: string
    readonly ctaTitle: string
    readonly ctaText: string
    readonly ctaAction: string
  }
  readonly demo: {
    readonly heroEyebrow: string
    readonly heroTitle: string
    readonly heroSubtitle: string
    readonly emailAction: string
    readonly emailSubject: string
    readonly contactTitle: string
    readonly emailText: string
    readonly phoneText: string
    readonly securityTitle: string
    readonly securityText: string
    readonly how: readonly RichPart[]
  }
  readonly legal: readonly RichPart[]
  readonly privacy: readonly RichPart[]
  readonly credits: {
    readonly intro: readonly RichPart[]
    readonly sourceWord: string
  }
}

export interface SaasFooterColumnCopy {
  readonly heading: string
  readonly links: readonly (
    | { readonly label: string; readonly page: SaasPageKey }
    | { readonly label: string; readonly feature: string }
  )[]
}

export interface SaasCopy {
  readonly locale: SaasLocale
  /** The product's name when the person gave none. */
  readonly defaultProductName: string
  readonly schema: {
    readonly routes: { readonly feature: string; readonly changelog: string }
    readonly labels: {
      readonly feature: { readonly singular: string; readonly plural: string }
      readonly changelog: { readonly singular: string; readonly plural: string }
    }
  }
  readonly slugs: Readonly<Record<SaasPageKey, string>>
  readonly phone: { readonly display: string; readonly href: string }
  readonly customers: readonly { readonly key: string; readonly name: string }[]
  readonly features: readonly SaasFeatureCopy[]
  readonly updates: readonly SaasUpdateCopy[]
  readonly media: readonly SaasMediaCopy[]
  readonly tiers: readonly SaasTierCopy[]
  readonly homeQuestions: (name: string) => readonly (readonly [string, string])[]
  readonly detailsTitle: string
  readonly otherFeaturesTitle: string
  readonly moreUpdatesTitle: string
  readonly pages: (name: string, mail: (mailbox: string) => string) => SaasPagesCopy
  readonly menus: {
    readonly header: readonly { readonly label: string; readonly page: SaasPageKey }[]
    readonly action: string
  }
  readonly footer: readonly SaasFooterColumnCopy[]
  readonly settings: { readonly tagline: string; readonly footerNote: string }
  readonly widgets: {
    readonly searchPlaceholder: string
    readonly archivesTitle: string
    readonly recentTitle: string
    readonly resourcesTitle: string
    readonly resources: readonly (
      | { readonly label: string; readonly page: SaasPageKey }
      | { readonly label: string; readonly feature: string }
    )[]
    readonly ctaHeading: string
    readonly ctaBody: string
    readonly ctaLabel: string
  }
}
