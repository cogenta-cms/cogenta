import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import type { DocumentationWriter, ProductNames, Typography } from './documentation-writer.js'
import type { MenuItemSpec } from './menus.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * Everything the `documentation` blueprint says to a visitor, typed once and
 * written twice (`documentation-copy-en.ts`, `documentation-copy-fr.ts`), the
 * way `vitrine-copy.ts` does for the `vitrine` blueprint. The French
 * documentation is written in French, with its own slugs, headings and
 * wording; code, commands, configuration keys and API names stay in English,
 * as they do in the French documentation of any developer tool.
 */

export type DocumentationLocale = 'fr' | 'en'

export type DocSectionKey = 'start' | 'guides' | 'reference' | 'help'

type PageBody = RichTextDocument[number] | readonly RichTextDocument[number][]

export interface DocPageDraft {
  readonly title: string
  readonly slug: string
  readonly section: DocSectionKey
  readonly summary: string
  readonly body: (
    w: DocumentationWriter,
    media: Readonly<Record<string, string>>,
  ) => readonly PageBody[]
}

export interface FooterColumn {
  readonly heading: string
  readonly links: readonly MenuItemSpec[]
}

export interface DocumentationCopy {
  readonly locale: DocumentationLocale
  /** The label of each section, stored in the `section` field of its pages. */
  readonly sections: Readonly<Record<DocSectionKey, string>>
  readonly pages: readonly DocPageDraft[]
  /** The slug of the release notes, which the upgrade widget does not appear on. */
  readonly changelogSlug: string
  readonly typography: Typography
  readonly home: {
    readonly slug: string
    readonly title: (name: string) => string
    readonly blocks: (names: ProductNames, w: DocumentationWriter) => readonly VocabularyBlock[]
  }
  readonly diagram: { readonly file: string; readonly alt: string }
  readonly menus: { readonly header: readonly MenuItemSpec[] }
  readonly footer: readonly FooterColumn[]
  readonly settings: Readonly<Record<string, unknown>>
  readonly widgets: (slugs: readonly string[]) => readonly BlueprintWidget[]
}
