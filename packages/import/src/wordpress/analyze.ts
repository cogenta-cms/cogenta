import { convertContent, mediaUrlsOf } from './content-convert.js'
import { parseWxr } from './parse.js'
import type { WxrItem } from './types.js'

/**
 * The "analyze" phase of a WordPress import (fiche 25 task 1): everything an
 * apply would do, without a database, a storage driver, or a single write.
 *
 * This deliberately duplicates the *counting* logic of `importWordPress`
 * (which post is importable, which is skipped, which media it references)
 * rather than the *writing* logic — the parts that touch `db`/`storage` are
 * the only parts absent, on purpose, per the pièges connus note: "la
 * prévisualisation doit venir du paquet, pas d'une deuxième analyse [de
 * moteur de rendu]". `convertContent` — the actual Gutenberg/HTML → block
 * conversion — runs for real, so the block/media counts here are exact, not
 * estimated.
 */

const IMPORTABLE_STATUSES = new Set(['publish', 'draft', 'pending', 'private', 'future'])

export interface WordPressPreviewCounts {
  readonly posts: number
  readonly pages: number
  readonly categories: number
  readonly tags: number
  readonly comments: number
  readonly attachments: number
}

export interface WordPressSlugConflict {
  readonly kind: 'post' | 'page'
  readonly slug: string
  /** WordPress ids sharing this slug — Cogenta's `unique` slug field will refuse all but the first. */
  readonly wpIds: readonly string[]
}

export interface WordPressPreviewIgnoredItem {
  readonly type: 'post' | 'page' | 'comment'
  readonly wpId: string
  readonly title: string
  readonly reason: string
}

export interface WordPressPreviewReport {
  readonly counts: WordPressPreviewCounts
  /** Fixed target collections this importer writes to — see `wordpress/collections.ts`'s header note on why they are not the site's own. */
  readonly collectionMapping: { readonly post: string; readonly page: string }
  readonly authors: readonly { readonly login: string; readonly email: string }[]
  readonly mediaUrls: readonly string[]
  /** `content-length` is unknown before the apply phase actually fetches each URL — this counts distinct URLs, not bytes. */
  readonly mediaCount: number
  readonly slugConflicts: readonly WordPressSlugConflict[]
  readonly ignored: readonly WordPressPreviewIgnoredItem[]
  readonly warnings: readonly string[]
}

function slugConflictsOf(
  items: readonly WxrItem[],
  kind: 'post' | 'page',
): WordPressSlugConflict[] {
  const bySlug = new Map<string, string[]>()
  for (const item of items) {
    if (!IMPORTABLE_STATUSES.has(item.status)) continue
    const slug = item.postName || item.postId
    const list = bySlug.get(slug) ?? []
    list.push(item.postId)
    bySlug.set(slug, list)
  }
  return [...bySlug.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([slug, wpIds]) => ({ kind, slug, wpIds }))
}

export function analyzeWordPress(xml: string): WordPressPreviewReport {
  const parsed = parseWxr(xml)

  const posts = parsed.items.filter((item) => item.postType === 'post')
  const pages = parsed.items.filter((item) => item.postType === 'page')
  const attachments = parsed.items.filter((item) => item.postType === 'attachment')

  const ignored: WordPressPreviewIgnoredItem[] = []
  const warnings: string[] = []
  const allMediaUrls = new Set<string>()

  const attachmentUrlById = new Map(
    attachments
      .filter((item): item is WxrItem & { attachmentUrl: string } => item.attachmentUrl !== null)
      .map((item) => [item.postId, item.attachmentUrl] as const),
  )
  for (const url of attachmentUrlById.values()) allMediaUrls.add(url)

  let commentCount = 0
  for (const item of [...posts, ...pages]) {
    const kind = item.postType === 'post' ? 'post' : 'page'

    if (item.status === 'trash') {
      ignored.push({
        type: kind,
        wpId: item.postId,
        title: item.title,
        reason: 'Trashed in WordPress.',
      })
      continue
    }
    if (!IMPORTABLE_STATUSES.has(item.status)) {
      ignored.push({
        type: kind,
        wpId: item.postId,
        title: item.title,
        reason: `Unrecognised WordPress status "${item.status}".`,
      })
      continue
    }

    const { blocks, notes } = convertContent(item.contentEncoded)
    for (const url of mediaUrlsOf(blocks)) allMediaUrls.add(url)
    const thumbnail =
      item.thumbnailId === null ? undefined : attachmentUrlById.get(item.thumbnailId)
    if (thumbnail !== undefined) allMediaUrls.add(thumbnail)

    for (const note of notes) {
      warnings.push(
        `"${item.title || item.postId}" — ${note.source}: ${note.reason} (kept as plain text).`,
      )
    }

    for (const comment of item.comments) {
      if (comment.approved === '1') {
        commentCount += 1
      } else {
        ignored.push({
          type: 'comment',
          wpId: comment.id,
          title: `Comment on "${item.title}"`,
          reason:
            comment.approved === 'spam'
              ? 'Marked as spam in WordPress.'
              : 'Not yet approved in WordPress.',
        })
      }
    }
  }

  if (parsed.authors.some((author) => author.email.trim().length === 0)) {
    warnings.push('At least one author has no email in the export; a placeholder will be used.')
  }

  return {
    counts: {
      posts: posts.length,
      pages: pages.length,
      categories: parsed.categories.length,
      tags: parsed.tags.length,
      comments: commentCount,
      attachments: attachments.length,
    },
    collectionMapping: { post: 'post', page: 'page' },
    authors: parsed.authors.map((author) => ({ login: author.login, email: author.email })),
    mediaUrls: [...allMediaUrls],
    mediaCount: allMediaUrls.size,
    slugConflicts: [...slugConflictsOf(posts, 'post'), ...slugConflictsOf(pages, 'page')],
    ignored,
    warnings,
  }
}
