/**
 * The words of the `vitrine` blueprint, in each language it ships in (L36).
 *
 * The site is an engineering company that designs sensors, software and field
 * services for critical infrastructure: energy, water, rail and industry. Every
 * visitor-facing string lives here, typed once and written twice (`fr`, `en`),
 * so the French site is written in French rather than translated at render
 * time, and a missing sentence in one language is a type error rather than a
 * blank on a page.
 *
 * `firm` is the name the person gave their site (`SeedContext.siteName`); the
 * copy names their company, never a fictional one, whenever one is known.
 */

/** Inline text: a plain string, or a run of strings and links. */
export type RichInline =
  | string
  | readonly (string | { readonly text: string; readonly href: string })[]

/** A paragraph, a second-level heading or a bulleted list, in reading order. */
export type RichPart =
  | { readonly p: RichInline }
  | { readonly h2: string }
  | { readonly bullets: readonly RichInline[] }

export type VitrineLocale = 'fr' | 'en'

export interface VitrineSolutionCopy {
  readonly slug: string
  readonly name: string
  /** One or two sentences: the card text and the page's standfirst. */
  readonly description: string
  readonly icon: string
  readonly media: string
  readonly body: (firm: string) => readonly RichPart[]
}

export interface VitrineCaseStudyCopy {
  readonly slug: string
  readonly title: string
  readonly client: string
  readonly location: string
  readonly sector: string
  readonly keyFigure: string
  readonly keyFigureLabel: string
  readonly summary: string
  readonly media: string
  readonly body: (firm: string) => readonly RichPart[]
}

export interface VitrineTestimonialCopy {
  readonly authorName: string
  readonly authorRole: string
  readonly quote: (firm: string) => string
}

export interface VitrineTeamMemberCopy {
  readonly name: string
  readonly role: string
  readonly description: string
}

export interface VitrineJobCopy {
  readonly slug: string
  readonly title: string
  readonly team: string
  readonly location: string
  readonly contract: string
  readonly summary: string
  readonly body: (firm: string) => readonly RichPart[]
}

export interface VitrinePostCopy {
  readonly slug: string
  readonly title: string
  readonly summary: string
  readonly author: string
  readonly publishedAt: string
  readonly sector: string
  readonly media: string
  readonly body: (firm: string) => readonly RichPart[]
}

export interface VitrineSectorCopy {
  readonly slug: string
  readonly name: string
  readonly icon: string
  readonly text: string
}

export interface VitrineMediaCopy {
  readonly name: string
  readonly file: string
  readonly alt: string
}

export interface VitrineCopy {
  readonly locale: VitrineLocale
  /** Collection, taxonomy and field names in the administration. */
  readonly schema: {
    readonly taxonomy: { readonly name: string; readonly singular: string; readonly plural: string }
    readonly routes: {
      readonly solution: string
      readonly caseStudy: string
      readonly job: string
      readonly post: string
    }
    readonly labels: Readonly<
      Record<
        'solution' | 'caseStudy' | 'testimonial' | 'teamMember' | 'job' | 'post',
        { readonly singular: string; readonly plural: string }
      >
    >
    readonly fields: Readonly<
      Record<
        | 'icon'
        | 'iconHelp'
        | 'client'
        | 'location'
        | 'keyFigure'
        | 'keyFigureLabel'
        | 'company'
        | 'team'
        | 'contract'
        | 'author',
        string
      >
    >
  }
  readonly pageSlugs: {
    readonly solutions: string
    readonly caseStudies: string
    readonly company: string
    readonly careers: string
    readonly news: string
    readonly contact: string
    readonly legal: string
    readonly privacy: string
    readonly credits: string
  }
  readonly sectors: readonly VitrineSectorCopy[]
  readonly solutions: readonly VitrineSolutionCopy[]
  readonly caseStudies: readonly VitrineCaseStudyCopy[]
  readonly testimonials: readonly [
    VitrineTestimonialCopy,
    VitrineTestimonialCopy,
    VitrineTestimonialCopy,
  ]
  readonly team: readonly VitrineTeamMemberCopy[]
  readonly jobs: readonly VitrineJobCopy[]
  readonly posts: readonly VitrinePostCopy[]
  readonly clients: readonly { readonly key: string; readonly name: string }[]
  readonly media: readonly VitrineMediaCopy[]
  /** Everything the pages say that is not an entry of a collection. */
  readonly pages: (firm: string) => VitrinePagesCopy
  readonly menus: {
    readonly header: readonly {
      readonly label: string
      readonly page: keyof VitrineCopy['pageSlugs']
    }[]
    readonly footer: readonly {
      readonly label: string
      readonly page: keyof VitrineCopy['pageSlugs']
    }[]
    readonly action: string
  }
  readonly settings: (firm: string) => {
    readonly tagline: string
    readonly footerNote: string
  }
  readonly widgets: {
    readonly sectors: string
    readonly moreCaseStudies: string
    readonly otherSolutions: string
    readonly recentPosts: string
    readonly contactTitle: string
    readonly contactHours: string
    readonly contactHoursValue: string
    readonly ctaHeading: string
    readonly ctaBody: string
    readonly ctaLabel: string
    readonly searchTitle: string
    readonly searchPlaceholder: string
    readonly relatedWork: string
    readonly openRoles: string
  }
}

export interface VitrinePagesCopy {
  readonly titles: Readonly<Record<keyof VitrineCopy['pageSlugs'] | 'home', string>>
  readonly home: {
    readonly heroEyebrow: string
    readonly heroTitle: string
    readonly heroSubtitle: string
    readonly heroPrimary: string
    readonly heroSecondary: string
    readonly clientsCaption: string
    readonly solutionsTitle: string
    readonly figuresTitle: string
    readonly figures: readonly {
      readonly value: string
      readonly unit?: string
      readonly label: string
    }[]
    readonly platformIntro: readonly RichPart[]
    readonly platformCaption: string
    readonly sectorsTitle: string
    readonly workTitle: string
    readonly newsTitle: string
    readonly faqTitle: string
    readonly faq: readonly (readonly [string, string])[]
    readonly ctaTitle: string
    readonly ctaText: string
    readonly ctaPrimary: string
    readonly ctaSecondary: string
  }
  readonly solutions: {
    readonly intro: readonly RichPart[]
    readonly listTitle: string
    readonly methodTitle: string
    readonly method: readonly (readonly [string, string])[]
    readonly detailCaption: string
  }
  readonly caseStudies: {
    readonly intro: readonly RichPart[]
    readonly figuresTitle: string
    readonly figures: readonly {
      readonly value: string
      readonly unit?: string
      readonly label: string
    }[]
    readonly logosTitle: string
  }
  readonly company: {
    readonly heroEyebrow: string
    readonly heroTitle: string
    readonly heroSubtitle: string
    readonly story: readonly RichPart[]
    readonly figuresTitle: string
    readonly figures: readonly { readonly value: string; readonly label: string }[]
    readonly principlesTitle: string
    readonly principles: readonly {
      readonly icon: string
      readonly title: string
      readonly text: string
    }[]
    readonly labCaption: string
    readonly teamTitle: string
    readonly fieldTitle: string
  }
  readonly careers: {
    readonly heroEyebrow: string
    readonly heroTitle: string
    readonly heroSubtitle: string
    readonly heroAction: string
    readonly intro: readonly RichPart[]
    readonly benefitsTitle: string
    readonly benefits: readonly {
      readonly icon: string
      readonly title: string
      readonly text: string
    }[]
    readonly rolesTitle: string
    readonly processTitle: string
    readonly process: readonly (readonly [string, string])[]
    readonly ctaTitle: string
    readonly ctaText: string
    readonly ctaAction: string
  }
  readonly news: { readonly intro: readonly RichPart[] }
  readonly contact: {
    readonly intro: readonly RichPart[]
    readonly officeCaption: string
    readonly ctaTitle: string
    readonly ctaText: string
    readonly ctaAction: string
  }
  readonly legal: readonly RichPart[]
  readonly privacy: readonly RichPart[]
  readonly credits: {
    readonly intro: readonly RichPart[]
    readonly licenceWord: string
    readonly sourceWord: string
  }
}
