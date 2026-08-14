import type { ProseBlock, QuoteBlock, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import type { SkinTokens } from '@cogenta/render'
import { renderSkinCss } from '@cogenta/render'
import type { RichTextDocument } from '@cogenta/schema'
import {
  type ContentEntry,
  type LinkTargetInput,
  type PageContent,
  type QueryRequest,
  type RenderContext,
  renderPage,
  serialize,
} from '@cogenta/theme-canonical'

/**
 * "Aperçu proposé sur trois pages types." Three fixed page compositions —
 * not a general "N template pages" system, nothing else in this codebase
 * needs one — rendered through the real, generic `renderPage`/`renderBlock`
 * (`@cogenta/theme-canonical`) against the candidate skin's real CSS
 * (`renderSkinCss`, `@cogenta/render`): the same pipeline a live site uses,
 * not a bespoke preview renderer.
 */

const VERSION = '1.0.0'

const PREVIEW_STRINGS: Readonly<Record<string, string>> = {
  'collection.empty': 'No entries yet.',
}

/** No preview block uses a media field, so `image` is never called for real. */
function previewContext(siteName: string): RenderContext {
  const site = {
    name: siteName,
    url: 'http://localhost:4000',
    locales: ['en'],
    defaultLocale: 'en',
  }
  return {
    site,
    locale: 'en',
    url: new URL(site.url),
    t: (key) => PREVIEW_STRINGS[key] ?? key,
    image: (): never => {
      throw new CogentaError({
        code: 'INTERNAL',
        message: 'Skin preview pages carry no media fields; `image` should never be called.',
        hint: 'This is a bug in the preview pages, not something a skin generation attempt can cause.',
      })
    },
    link: (target: LinkTargetInput) =>
      typeof target === 'string'
        ? target
        : 'path' in target
          ? target.path
          : `/${target.collection}/${target.id}`,
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async (_request: QueryRequest) => ({ items: [] as ContentEntry[], nextCursor: null }),
    },
  }
}

function paragraph(key: string, text: string): RichTextDocument[number] {
  return {
    _key: key,
    _type: 'block',
    style: 'normal',
    children: [{ _key: `${key}-span`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

function proseBlock(key: string, text: string): ProseBlock {
  return { _key: key, _type: 'prose', _version: VERSION, body: [paragraph(`${key}-p`, text)] }
}

const PREVIEW_PAGES: readonly PageContent[] = [
  {
    title: 'Landing',
    blocks: [
      {
        _key: 'preview-landing-hero',
        _type: 'hero',
        _version: VERSION,
        eyebrow: 'Preview',
        title: 'A site that runs itself',
        subtitle:
          'This page previews the generated skin against a hero and a paragraph of body text.',
      },
      proseBlock(
        'preview-landing-prose',
        'Body copy renders in the same colours and type scale a visitor would see, so contrast and hierarchy can be checked before the skin is applied for real.',
      ),
    ],
  },
  {
    title: 'Article',
    blocks: [
      proseBlock(
        'preview-article-prose',
        'An article page: a paragraph of prose followed by a pull quote, the combination most content pages actually use.',
      ),
      {
        _key: 'preview-article-quote',
        _type: 'quote',
        _version: VERSION,
        text: 'The constraint is what makes the quality: the model configures a theme, it never writes one.',
        author: 'Cogenta',
      } satisfies QuoteBlock,
    ],
  },
  {
    title: 'Listing',
    blocks: [
      proseBlock(
        'preview-listing-prose',
        'A listing page, showing how the skin looks with no accent colour on the page besides links and structure.',
      ),
      {
        _key: 'preview-listing-collection',
        _type: 'collectionList',
        _version: VERSION,
        title: 'Recent entries',
        collection: 'post',
        limit: 10,
        layout: 'list',
      },
    ] as readonly VocabularyBlock[],
  },
]

export interface SkinPreviewPage {
  readonly filename: string
  readonly title: string
  readonly html: string
}

export function renderSkinPreview(
  tokens: SkinTokens,
  siteName: string,
): readonly SkinPreviewPage[] {
  const ctx = previewContext(siteName)
  const css = renderSkinCss(tokens)
  return PREVIEW_PAGES.map((page, index) => {
    const body = serialize(renderPage(page, ctx))
    const html = [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      `<title>${page.title} — skin preview</title>`,
      `<style>${css}</style>`,
      '</head>',
      '<body>',
      body,
      '</body>',
      '</html>',
      '',
    ].join('\n')
    return {
      filename: `preview-${index + 1}-${page.title.toLowerCase()}.html`,
      title: page.title,
      html,
    }
  })
}
