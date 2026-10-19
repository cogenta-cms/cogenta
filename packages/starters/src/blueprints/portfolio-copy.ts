/**
 * The words of the `portfolio` blueprint, in each language it ships in.
 *
 * The site is an independent photography studio that works on commission for
 * nature reserves, regional parks, growers, ports and heritage bodies. Every
 * visitor-facing string lives here, typed once and written twice (`fr`, `en`),
 * so the French site is written in French rather than translated at render
 * time, and a missing sentence in one language is a type error rather than a
 * blank on a page. The structure follows `vitrine-copy.ts`.
 *
 * `studio` is the name the person gave their site (`SeedContext.siteName`);
 * the copy names their studio, never a fictional one, whenever one is known.
 */

export type PortfolioLocale = 'fr' | 'en'

/**
 * One piece of a project page or of a prose section, in reading order. In a
 * paragraph, `*words*` is set in italic (the title of a work); nothing else
 * is interpreted.
 */
export type PortfolioPart =
  | { readonly h2: string }
  | { readonly p: string }
  | {
      readonly figure: string
      readonly caption: string
      readonly align: 'start' | 'center' | 'end' | 'wide' | 'full'
    }
  | { readonly gallery: readonly string[]; readonly layout: 'grid' | 'carousel' | 'masonry' }
  | { readonly quote: string; readonly author: string; readonly role: string }
  | { readonly testimonial: string; readonly name: string; readonly role: string }

export interface PortfolioDisciplineCopy {
  readonly slug: string
  readonly name: string
  readonly description: string
}

export interface PortfolioPersonCopy {
  readonly slug: string
  readonly name: string
  readonly role: string
}

export interface PortfolioProjectCopy {
  readonly slug: string
  readonly title: string
  readonly client: { readonly name: string; readonly slug: string }
  /** The one discipline set under the cover. */
  readonly discipline: string
  /** `PortfolioDisciplineCopy.slug`s. */
  readonly disciplines: readonly string[]
  /** `PortfolioPersonCopy.slug`s, lead first. */
  readonly team: readonly string[]
  /** ISO 8601, the date the work was finished. Listed oldest first. */
  readonly publishedAt: string
  readonly summary: string
  /** `PortfolioMediaCopy.name` of the 3:2 cover. */
  readonly cover: string
  readonly body: (studio: string) => readonly PortfolioPart[]
}

export interface PortfolioMediaCopy {
  readonly name: string
  /** The file under `assets/photos/portfolio/`. */
  readonly file: string
  readonly alt: string
}

export type PortfolioPageKey = 'home' | 'work' | 'studio' | 'contact' | 'privacy' | 'credits'

export interface PortfolioMailboxes {
  readonly hello: string
  readonly jobs: string
  readonly press: string
}

export interface PortfolioPagesCopy {
  readonly titles: Readonly<Record<PortfolioPageKey, string>>
  readonly home: {
    readonly heroTitle: string
    readonly heroSubtitle: string
    readonly heroAction: string
    readonly workTitle: string
    readonly disciplinesTitle: string
    readonly figuresTitle: string
    readonly figures: readonly { readonly value: string; readonly label: string }[]
    readonly quote: { readonly text: string; readonly author: string; readonly role: string }
    readonly clientsTitle: string
    readonly clients: readonly string[]
    readonly indexTitle: string
    readonly ctaTitle: string
    readonly ctaText: string
  }
  readonly work: { readonly disciplinesTitle: string }
  readonly studio: {
    readonly about: readonly PortfolioPart[]
    readonly how: readonly PortfolioPart[]
    readonly principlesTitle: string
    readonly principles: readonly { readonly title: string; readonly text: string }[]
    readonly numbersTitle: string
    readonly numbers: readonly { readonly value: string; readonly label: string }[]
    readonly partnersTitle: string
    readonly partners: readonly {
      readonly slug: string
      readonly name: string
      readonly text: string
    }[]
    readonly testimonial: {
      readonly text: string
      readonly name: string
      readonly role: string
    }
    readonly faqTitle: string
    readonly faq: readonly (readonly [string, string])[]
  }
  readonly contact: {
    readonly ctaTitle: string
    readonly ctaText: string
    readonly phoneLabel: string
    readonly phoneHref: string
    readonly visit: readonly PortfolioPart[]
    readonly jobs: readonly PortfolioPart[]
    readonly press: readonly PortfolioPart[]
  }
  readonly privacy: readonly PortfolioPart[]
  readonly credits: {
    readonly intro: readonly PortfolioPart[]
    readonly licenceWord: string
    readonly sourceWord: string
  }
}

export interface PortfolioCopy {
  readonly locale: PortfolioLocale
  /** Collection, taxonomy and field names in the administration. */
  readonly schema: {
    readonly routes: { readonly project: string }
    readonly labels: { readonly singular: string; readonly plural: string }
    readonly taxonomies: Readonly<
      Record<
        'client' | 'disciplines' | 'team',
        { readonly name: string; readonly singular: string; readonly plural: string }
      >
    >
    readonly fields: {
      readonly statement: string
      readonly statementHelp: string
      readonly client: string
      readonly clientHelp: string
      readonly discipline: string
      readonly clientArchive: string
      readonly clientArchiveHelp: string
    }
  }
  readonly pageSlugs: Readonly<Record<PortfolioPageKey, string>>
  readonly disciplines: readonly PortfolioDisciplineCopy[]
  readonly team: readonly PortfolioPersonCopy[]
  readonly projects: readonly PortfolioProjectCopy[]
  readonly media: readonly PortfolioMediaCopy[]
  readonly pages: (studio: string, mailboxes: PortfolioMailboxes) => PortfolioPagesCopy
  readonly menus: {
    readonly header: readonly PortfolioPageKey[]
    readonly footer: readonly PortfolioPageKey[]
    readonly labels: Readonly<Record<PortfolioPageKey, string>>
  }
  readonly settings: {
    readonly tagline: string
    readonly footerNote: string
  }
  readonly widgets: {
    readonly disciplines: string
    readonly clients: string
    readonly team: string
    readonly moreWork: string
    readonly ctaTitle: string
    readonly ctaHeading: string
    readonly ctaBody: string
    readonly ctaLabel: string
  }
}
