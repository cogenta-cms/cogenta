import type { RichTextDocument } from '@cogenta/schema'
import type { PhotoCredit } from './blog-credits.js'
import type { BlueprintMenus } from './menus.js'

/**
 * The words of the `blog` blueprint, in each language it ships in.
 *
 * Every visitor-facing string lives in a `BlogCopy`, typed once and written
 * twice (`fr`, `en`): the French site is written in French rather than
 * translated at render time, and a sentence missing from one language is a
 * type error rather than a blank on a page. Same pattern as `vitrine-copy.ts`.
 *
 * The site is one writer's publication of essays and letters about reading,
 * writing and walking. The English fiction is set in Leeds and York; the French
 * one in Toulouse and Montauban, so neither reads as a translation of the other.
 */

export type BlogLocale = 'fr' | 'en'

export interface BlogCopyContext {
  readonly siteName: string
  readonly media: Readonly<Record<string, string>>
}

export interface BlogDemoCategory {
  readonly name: string
  readonly slug: string
  readonly description: string
}

export interface BlogDemoTag {
  readonly name: string
  readonly slug: string
}

export interface BlogDemoPost {
  readonly title: string
  readonly slug: string
  readonly excerpt: string
  /** ISO 8601. Posts are listed oldest first here and inserted in this order. */
  readonly publishedAt: string
  /** A `DemoMediaSpec.name` for the cover, when this piece has one. */
  readonly cover?: string
  /** The short label a listing card sets above the title, when this piece has one. */
  readonly topic?: string
  readonly categorySlug: string
  readonly tagSlugs: readonly string[]
  readonly body: (copy: BlogCopyContext) => RichTextDocument
}

export interface BlogTaxonomyNames {
  /** The taxonomy's machine name, which is also its public path segment. */
  readonly name: string
  readonly singular: string
  readonly plural: string
}

export interface BlogFaqCopy {
  readonly key: string
  readonly question: string
  readonly answer: string
}

export interface BlogCopy {
  readonly locale: BlogLocale
  /** Used when the person scaffolding did not name their site. */
  readonly defaultPublicationName: string
  readonly schema: {
    readonly category: BlogTaxonomyNames
    readonly tag: BlogTaxonomyNames
    readonly post: { readonly singular: string; readonly plural: string }
    readonly page: { readonly singular: string; readonly plural: string }
  }
  readonly categories: readonly BlogDemoCategory[]
  readonly tags: readonly BlogDemoTag[]
  readonly posts: readonly BlogDemoPost[]
  /** The essay the home page opens on, and the letter its call to action points at. */
  readonly featuredSlug: string
  readonly latestLetterSlug: string
  /** The category the Sunday letters are filed under. */
  readonly lettersCategorySlug: string
  readonly slugs: {
    readonly home: string
    readonly about: string
    readonly archive: string
    readonly newsletter: string
    readonly credits: string
  }
  readonly home: {
    readonly title: string
    /** The home page's meta description, from the site's name; at most 160 characters. */
    readonly seoDescription: (siteName: string) => string
    readonly eyebrow: string
    readonly readEssay: string
    readonly latestTitle: string
    readonly epigraph: { readonly text: string; readonly author: string; readonly role: string }
    readonly archiveTitle: string
    readonly moreTitle: string
    readonly subjectsTitle: string
    readonly letterTitle: string
    readonly letterText: string
    readonly letterFollow: string
    readonly letterLatest: string
  }
  readonly about: {
    readonly title: string
    /** `desk` is the media id of the desk photograph, when the scaffold ingested it. */
    readonly body: (ctx: { siteName: string; desk: string | undefined }) => RichTextDocument
    readonly faqTitle: string
    readonly faq: (siteName: string) => readonly BlogFaqCopy[]
  }
  readonly archive: { readonly title: string; readonly intro: (siteName: string) => string }
  readonly newsletter: {
    readonly title: string
    readonly paragraphs: (siteName: string) => readonly string[]
    readonly ctaTitle: string
    readonly ctaText: string
    readonly subscribe: string
    readonly past: string
  }
  readonly credits: {
    readonly title: string
    readonly intro: string
    readonly line: (credit: PhotoCredit) => string
  }
  readonly menus: BlueprintMenus
  readonly settings: {
    readonly tagline: string
    readonly footerNote: string
    readonly socialLinks: readonly { readonly label: string; readonly url: string }[]
  }
  readonly widgets: {
    readonly aboutTitle: string
    readonly aboutBody: string
    readonly aboutLink: string
    readonly searchTitle: string
    readonly searchPlaceholder: string
    readonly recentTitle: string
    readonly subjectsTitle: string
    readonly tagsTitle: string
    readonly yearTitle: string
    readonly relatedTitle: string
  }
  /** Alt text of each bundled photograph, by `DemoMediaSpec.name`. */
  readonly mediaAlt: Readonly<Record<string, string>>
}
