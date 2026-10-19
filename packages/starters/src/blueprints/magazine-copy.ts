import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'

/**
 * What differs between the English and the French `magazine` site: every
 * word a visitor reads, and nothing else. The content model, the page
 * structure and the seeding live once in `magazine.ts`; `magazine-copy-en.ts`
 * and `magazine-copy-fr.ts` each supply one `MagazineCopy` (the same split
 * `vitrine-copy*.ts` makes for `vitrine`).
 */

export type MagazineLocale = 'en' | 'fr'

export const BLOCK_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Rich text and blocks, written as data
// ---------------------------------------------------------------------------

type RichNode = RichTextDocument[number]

let nodeKey = 0

function nextKey(prefix: string): string {
  nodeKey += 1
  return `${prefix}-${nodeKey}`
}

/** A run of text where `*words*` is set in italic (the title of a work). Nothing else is interpreted. */
function spans(text: string, key: string) {
  return text
    .split(/(\*[^*]+\*)/)
    .filter((part) => part !== '')
    .map((part, index) => {
      const italic = part.startsWith('*') && part.endsWith('*') && part.length > 2
      return {
        _key: `${key}-s${index}`,
        _type: 'span' as const,
        text: italic ? part.slice(1, -1) : part,
        marks: italic ? ['em'] : [],
      }
    })
}

function textBlock(style: 'normal' | 'h2' | 'h3', text: string): RichNode {
  const key = nextKey(`mag-${style}`)
  return { _key: key, _type: 'block', style, children: spans(text, key), markDefs: [] }
}

export const p = (text: string): RichNode => textBlock('normal', text)
export const h2 = (text: string): RichNode => textBlock('h2', text)

export function prose(...body: readonly RichNode[]): VocabularyBlock {
  return {
    _key: nextKey('mag-prose'),
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: [...body],
  } as VocabularyBlock
}

export function pullQuote(text: string, who: string, role: string): VocabularyBlock {
  return {
    _key: nextKey('mag-quote'),
    _type: 'quote',
    _version: BLOCK_VERSION,
    text,
    author: who,
    role,
  } as VocabularyBlock
}

/** One plain paragraph as the rich-text document an FAQ answer or a testimonial stores. */
export function answer(key: string, text: string): RichTextDocument {
  return [
    {
      _key: key,
      _type: 'block',
      style: 'normal',
      children: [{ _key: `${key}-span`, _type: 'span', text, marks: [] }],
      markDefs: [],
    },
  ]
}

// ---------------------------------------------------------------------------
// Sections, writers, photographs
// ---------------------------------------------------------------------------

export type MagazineSectionSlug = 'news' | 'business' | 'culture' | 'opinion'

export interface MagazineDemoSection {
  readonly name: string
  readonly slug: MagazineSectionSlug
  readonly description: string
}

export interface MagazineDemoAuthor {
  readonly name: string
  readonly slug: string
}

/** What a piece of demo journalism may refer to: the publication's own name. */
export interface MagazineCopyContext {
  readonly siteName: string
}

/** The lead photograph an article opens with: a `DemoMediaSpec.name` and its caption. The credit line is the real photographer's, from `magazine-credits.ts`. */
export interface MagazineDemoPhoto {
  readonly media: string
  readonly caption: string
}

export interface MagazineDemoArticle {
  readonly title: string
  readonly slug: string
  readonly kicker: string
  readonly excerpt: string
  readonly section: MagazineSectionSlug
  /** `MagazineDemoAuthor.slug`s, in byline order. */
  readonly authors: readonly string[]
  /** ISO 8601. Articles are listed oldest first here and inserted in this order. */
  readonly publishedAt: string
  readonly frontPage: boolean
  readonly photo?: MagazineDemoPhoto
  /** The body after the lead photograph, which the seed places first. */
  readonly body: (copy: MagazineCopyContext) => readonly VocabularyBlock[]
}

export interface MagazineFaq {
  readonly key: string
  readonly question: string
  readonly answer: string
}

export interface MagazinePlan {
  readonly key: string
  readonly name: string
  readonly price: string
  readonly interval: string
  readonly features: readonly string[]
  readonly actionLabel: string
  readonly href: string
  readonly highlighted?: boolean
}

/** The words of the five seeded pages. Structure and block keys live in `magazine.ts`. */
export interface MagazinePagesCopy {
  readonly home: {
    readonly title: string
    readonly opinionRail: string
    readonly cultureRail: string
    readonly mostRead: string
    readonly businessRail: string
    readonly ctaTitle: string
    readonly ctaText: (siteName: string) => string
    readonly ctaSubscribe: string
    readonly ctaStandards: string
  }
  readonly about: {
    readonly title: string
    readonly slug: string
    readonly body: (siteName: string) => readonly RichTextDocument[number][]
    readonly figuresTitle: string
    readonly figures: readonly {
      readonly value: string
      readonly unit?: string
      readonly label: string
    }[]
    readonly sectionsTitle: string
    readonly quote: { readonly text: string; readonly author: string; readonly role: string }
  }
  readonly subscribe: {
    readonly title: string
    readonly slug: string
    readonly body: (siteName: string) => readonly RichTextDocument[number][]
    readonly plansTitle: string
    readonly plans: readonly MagazinePlan[]
    readonly letter: { readonly text: string; readonly name: string; readonly role: string }
    readonly faqTitle: string
    readonly faq: readonly MagazineFaq[]
    readonly newsletterTitle: string
    readonly newsletterText: string
    readonly newsletterAction: string
  }
  readonly standards: {
    readonly title: string
    readonly slug: string
    readonly body: (siteName: string) => readonly RichTextDocument[number][]
    readonly contactTitle: string
    readonly contact: readonly MagazineFaq[]
  }
  readonly credits: {
    readonly title: string
    readonly slug: string
    readonly intro: string
    /** The word a credit's link to the photograph's page is written as. */
    readonly sourceWord: string
    /** A licence as the locale names it ("Public domain" is "Domaine public" in French). */
    readonly licenceName: (licence: string) => string
  }
}

export interface MagazineWidgetCopy {
  readonly searchTitle: string
  readonly searchPlaceholder: string
  readonly latestTitle: string
  readonly sectionsTitle: string
  readonly ctaHeading: string
  readonly ctaBody: string
  readonly ctaLabel: string
  readonly relatedTitle: string
}

export interface MagazineMenuCopy {
  readonly about: string
  readonly subscribe: string
  readonly standards: string
  readonly credits: string
}

export interface MagazineCopy {
  readonly locale: MagazineLocale
  /** The fictional publication named when the person scaffolding gave none. */
  readonly publicationName: string
  readonly sections: readonly MagazineDemoSection[]
  readonly authors: readonly MagazineDemoAuthor[]
  /** Oldest first. */
  readonly articles: readonly MagazineDemoArticle[]
  /** Alt text of each bundled photograph, by `DemoMediaSpec.name`. */
  readonly mediaAlts: Readonly<Record<string, string>>
  /** `Photograph: Mikani (CC BY 4.0)` in the locale's own form. */
  readonly leadCredit: (author: string, licence: string) => string
  readonly pages: MagazinePagesCopy
  readonly menu: MagazineMenuCopy
  readonly widgets: MagazineWidgetCopy
  readonly tagline: string
  readonly footerNote: string
}
