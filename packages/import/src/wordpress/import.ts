import { createUserStore, ensureAuthTables } from '@cogenta/auth'
import type { CommentStatus, CommentStore } from '@cogenta/comments'
import { createDatabaseMediaStore, type DatabaseHandle, type StorageDriver } from '@cogenta/core'
import {
  buildPath,
  createContentStore,
  createRedirectStore,
  createSchemaTables,
} from '@cogenta/schema'
import type { ImportTrackingStore } from '../tracking.js'
import {
  WORDPRESS_IMPORT_COLLECTIONS,
  wpCategory,
  wpComment,
  wpPage,
  wpPost,
  wpTag,
} from './collections.js'
import {
  type ContentConversionNote,
  convertContent,
  type DraftBlock,
  mediaUrlsOf,
  resolveMediaReferences,
} from './content-convert.js'
import { downloadAndStoreMedia } from './media.js'
import { parseWxr } from './parse.js'
import { type ConversionReport, emptyReport, type UnconvertedItem } from './report.js'
import type { WxrComment, WxrItem } from './types.js'

export interface ImportWordPressOptions {
  readonly db: DatabaseHandle
  readonly storage: StorageDriver
  /** Injected for tests — real `fetch` by default. */
  readonly fetchImpl?: typeof fetch
  /**
   * Fiche 25 tasks 3-4: when both are given, every post/page/comment this
   * apply writes is recorded against `runId` — what makes a second call with
   * the same `runId` a **resume** (already-recorded WordPress ids are
   * skipped rather than re-created) and what `undoImport` reads to trash
   * everything a run produced. Categories, tags, media and authors are
   * deliberately not tracked here: they are reference data a second import
   * or the site's own editors may already depend on, so undo leaves them in
   * place — the same choice WordPress's own "remove imported posts" tools
   * make.
   */
  readonly tracking?: ImportTrackingStore
  readonly runId?: string
  /**
   * Fiche 15 task 7 (ADR-0025): when given, every importable WordPress
   * comment is written through contract F's own store — real status
   * (approved/pending/spam/trash, from `wp:comment_approved`, not just the
   * `'1'` this importer used to keep), real threading (`wp:comment_parent`),
   * on both posts *and* pages (pages were silently skipped entirely before
   * this option existed — a real, independent bug, not something this
   * fiche introduced).
   *
   * Absent keeps the pre-fiche-15 behaviour: only approved (`'1'`) comments,
   * only on posts, written into the synthetic `comment` collection
   * (`collections.ts`'s `wpComment`) — kept for a caller that has not wired
   * `@cogenta/comments` yet. A caller SHOULD pass this; `cogenta import
   * wordpress` (the CLI) always does.
   */
  readonly comments?: CommentStore
}

/** `wp:comment_approved`'s four real values, mapped to contract F's own vocabulary. Anything else (WordPress has used `'hold'` too) degrades to `pending` rather than being silently dropped. */
function wpApprovedToStatus(approved: string): CommentStatus {
  if (approved === '1') return 'approved'
  if (approved === 'spam') return 'spam'
  if (approved === 'trash') return 'trash'
  return 'pending'
}

/**
 * WordPress's classic comment form allowed a small set of inline tags
 * (`<a>`, `<em>`, `<strong>`, …) that contract F refuses outright (R3, first
 * line of defense against stored XSS — `CommentStore.create` has no
 * escape hatch for "a little HTML is fine"). Rather than drop such a
 * comment, its markup is stripped to plain text and the loss is reported —
 * the same "degrade and report, never lose silently" contract every other
 * step of this importer already follows.
 */
function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<[^>]*>/gu, '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#0?39;/giu, "'")
    .replace(/\s+/gu, ' ')
    .trim()
}

const APPROVED = '1'
const IMPORTABLE_STATUSES = new Set(['publish', 'draft', 'pending', 'private', 'future'])

function wpDateToIso(wpDate: string): string | null {
  if (wpDate.length === 0 || wpDate === '0000-00-00 00:00:00') return null
  const iso = wpDate.includes('T') ? wpDate : `${wpDate.replace(' ', 'T')}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/**
 * Contract A's `f.blocks()` zone shape — `_key`/`_type` folded into
 * `key`/`type`, everything else under `data`. `@cogenta/schema` exports the
 * identical shape as `ContentBlock`; this stays a local, structural type
 * rather than importing it, to keep this converter decoupled from that
 * package's internal store types.
 */
interface StoredBlock {
  readonly key: string
  readonly type: string
  readonly data: Readonly<Record<string, unknown>>
}

function toContentBlocks(blocks: readonly DraftBlock[]): readonly StoredBlock[] {
  return blocks.map((block) => {
    const { _key, _type, ...data } = block
    return { key: _key, type: _type, data: data as Record<string, unknown> }
  })
}

function relativePathOf(link: string, baseUrl: string): string | null {
  try {
    const url = new URL(link, baseUrl || link)
    return url.pathname
  } catch {
    return null
  }
}

/**
 * Imports a WordPress "Export All Content" WXR file into Cogenta.
 *
 * Every step degrades to a report entry rather than aborting the import: a
 * dead media URL, an unmappable Gutenberg block, an author with no email, a
 * redirect that would loop — none of them stop the run, because the lot's own
 * framing is explicit that a reported partial loss beats a silent one. The
 * only thing that stops the run is a document `parseWxr` cannot read at all.
 */
export async function importWordPress(
  xml: string,
  options: ImportWordPressOptions,
): Promise<ConversionReport> {
  const { db, storage } = options
  const parsed = parseWxr(xml)
  const acc = emptyReport()

  await createSchemaTables(db, WORDPRESS_IMPORT_COLLECTIONS)
  await ensureAuthTables(db)

  const users = createUserStore(db)
  const redirects = createRedirectStore({ db })
  await redirects.ensureTable()
  const mediaStore = createDatabaseMediaStore({ db })

  const categoryStore = createContentStore({ db, collection: wpCategory })
  const tagStore = createContentStore({ db, collection: wpTag })
  const postStore = createContentStore({ db, collection: wpPost })
  const pageStore = createContentStore({ db, collection: wpPage })
  const commentStore = createContentStore({ db, collection: wpComment })

  // ---- Authors -------------------------------------------------------
  const loginToUserId = new Map<string, string>()
  for (const author of parsed.authors) {
    const email =
      author.email.trim().length > 0
        ? author.email.trim()
        : `${author.login || 'author'}@imported.invalid`
    if (author.email.trim().length === 0) {
      acc.warnings.push(
        `Author "${author.login}" had no email in the export; used a placeholder (${email}).`,
      )
    }
    try {
      const user = await users.create({ email, roles: ['author'] })
      loginToUserId.set(author.login, user.id)
      acc.imported.authors += 1
    } catch {
      // AUTH_USER_EXISTS: a previous import (or the site itself) already has
      // this email — reuse that account rather than failing the whole run.
      const existing = await users.byEmail(email)
      if (existing !== null) loginToUserId.set(author.login, existing.id)
    }
  }

  // ---- Categories & tags ----------------------------------------------
  // A resumed apply (task 3) re-parses the same WXR and reaches this loop
  // again: `slug` is `unique`, so re-creating an already-imported category or
  // tag would throw rather than silently duplicate. Looking it up by slug
  // first makes this idempotent, the same property `recordItem` gives posts
  // and pages via the tracking table — categories/tags have no source id of
  // their own to track against, but their slug already is one.
  const categoryByNiceName = new Map<string, string>()
  for (const category of parsed.categories) {
    const slug = category.niceName
    const existing = await categoryStore.list({ where: { slug }, limit: 1 })
    if (existing.items[0] !== undefined) {
      categoryByNiceName.set(category.niceName, existing.items[0].id)
      continue
    }
    const entry = await categoryStore.create({
      values: { name: category.name || category.niceName, slug },
      status: 'published',
    })
    categoryByNiceName.set(category.niceName, entry.id)
    acc.imported.categories += 1
  }

  const tagByNiceName = new Map<string, string>()
  for (const tag of parsed.tags) {
    const slug = tag.slug
    const existing = await tagStore.list({ where: { slug }, limit: 1 })
    if (existing.items[0] !== undefined) {
      tagByNiceName.set(tag.slug, existing.items[0].id)
      continue
    }
    const entry = await tagStore.create({
      values: { name: tag.name || tag.slug, slug },
      status: 'published',
    })
    tagByNiceName.set(tag.slug, entry.id)
    acc.imported.tags += 1
  }

  // ---- Resume (task 3) -------------------------------------------------
  // Entry ids are deterministic (`store.create({ id: item.postId, … })`
  // below), so a WordPress id already recorded for this run was already
  // written by an earlier, interrupted attempt. Filtering it out here — not
  // merely skipping the write — is what also keeps its comments from being
  // re-created: `commentStore.create` has no id of its own to dedupe on, so
  // reaching that loop a second time for the same post would duplicate them.
  const done =
    options.tracking !== undefined && options.runId !== undefined
      ? await options.tracking.doneSourceIds(options.runId)
      : new Set<string>()

  // ---- Media --------------------------------------------------------
  const posts = parsed.items
    .filter((item) => item.postType === 'post')
    .filter((item) => !done.has(item.postId))
  const pages = parsed.items
    .filter((item) => item.postType === 'page')
    .filter((item) => !done.has(item.postId))
  const attachments = parsed.items.filter((item) => item.postType === 'attachment')

  const attachmentUrlById = new Map(
    attachments
      .filter((item): item is WxrItem & { attachmentUrl: string } => item.attachmentUrl !== null)
      .map((item) => [item.postId, item.attachmentUrl] as const),
  )

  const converted = new Map<
    string,
    { blocks: readonly DraftBlock[]; notes: ContentConversionNote[] }
  >()
  const allMediaUrls = new Set<string>()
  for (const item of [...posts, ...pages]) {
    const { blocks, notes } = convertContent(item.contentEncoded)
    converted.set(item.postId, { blocks, notes: [...notes] })
    for (const url of mediaUrlsOf(blocks)) allMediaUrls.add(url)
    const thumbnail =
      item.thumbnailId === null ? undefined : attachmentUrlById.get(item.thumbnailId)
    if (thumbnail !== undefined) allMediaUrls.add(thumbnail)
  }
  for (const url of attachmentUrlById.values()) allMediaUrls.add(url)

  const mediaResult = await downloadAndStoreMedia([...allMediaUrls], {
    mediaStore,
    storage,
    createdBy: null,
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  })
  acc.imported.media = mediaResult.imported.length
  for (const failure of mediaResult.failed) {
    acc.warnings.push(`Media "${failure.url}" could not be downloaded: ${failure.reason}`)
  }
  for (const asset of mediaResult.imported) {
    acc.warnings.push(
      `Media "${asset.filename}" was imported with a synthesised alt text; review it.`,
    )
  }

  // ---- Posts & pages --------------------------------------------------
  async function writeEntry(
    item: WxrItem,
    store: typeof postStore | typeof pageStore,
    kind: 'post' | 'page',
  ): Promise<string | null> {
    if (item.status === 'trash') {
      acc.skipped.push({
        type: kind,
        wpId: item.postId,
        title: item.title,
        reason: 'Trashed in WordPress; not imported.',
      })
      return null
    }
    if (!IMPORTABLE_STATUSES.has(item.status)) {
      acc.skipped.push({
        type: kind,
        wpId: item.postId,
        title: item.title,
        reason: `Unrecognised WordPress status "${item.status}".`,
      })
      return null
    }

    const draft = converted.get(item.postId)
    const notes = draft?.notes ?? []
    const resolvedBlocks = resolveMediaReferences(
      draft?.blocks ?? [],
      mediaResult.urlToMediaId,
      notes,
    )
    for (const note of notes) {
      acc.unconvertedBlocks.push({
        ...note,
        postTitle: item.title || `(untitled ${kind} ${item.postId})`,
      })
    }

    const status = item.status === 'publish' ? 'published' : 'draft'
    const createdBy = loginToUserId.get(item.creator) ?? null
    if (createdBy === null && item.creator.length > 0) {
      acc.warnings.push(
        `Author "${item.creator}" of "${item.title}" was not found among the export's authors.`,
      )
    }

    const customFields = Object.fromEntries(
      item.postMeta
        .filter((meta) => !meta.key.startsWith('_'))
        .map((meta) => [meta.key, meta.value]),
    )

    const values: Record<string, unknown> = {
      title: item.title || `(untitled ${item.postId})`,
      slug: item.postName || item.postId,
      publishedAt: wpDateToIso(item.postDate),
      customFields,
    }
    if (kind === 'post') {
      values['excerpt'] = item.excerptEncoded
      const categoryRef = item.categories.find((ref) => ref.domain === 'category')
      const category =
        categoryRef === undefined ? null : (categoryByNiceName.get(categoryRef.niceName) ?? null)
      if (category !== null) values['category'] = category
      values['tags'] = item.categories
        .filter((ref) => ref.domain === 'post_tag')
        .map((ref) => tagByNiceName.get(ref.niceName))
        .filter((id): id is string => id !== undefined)
    }

    const entry = await store.create({
      id: item.postId,
      status,
      createdBy,
      values,
      blocks: { body: toContentBlocks(resolvedBlocks) },
    })

    const collection = kind === 'post' ? wpPost : wpPage
    const to = buildPath(collection, { slug: values['slug'] as string })
    const from = relativePathOf(item.link, parsed.baseUrl)
    if (from !== null && from !== to) {
      try {
        await redirects.add({ from, to, reason: 'import', collection: kind, entryId: entry.id })
        acc.redirectsCreated += 1
      } catch (error) {
        acc.warnings.push(
          `Redirect ${from} → ${to} was not created: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    return entry.id
  }

  // Posts and pages are recorded under their bare WordPress id, matching
  // `done` above (which the resume filter checks the same id against);
  // comments get a prefixed id since a comment id and a post id share the
  // same small-integer namespace in a WXR export and would otherwise collide
  // in the tracking table's `(run_id, source_id)` uniqueness.
  async function record(
    kind: 'post' | 'page' | 'comment',
    wpId: string,
    entryId: string,
  ): Promise<void> {
    if (options.tracking === undefined || options.runId === undefined) return
    await options.tracking.recordItem({
      runId: options.runId,
      sourceId: kind === 'comment' ? `comment:${wpId}` : wpId,
      collection: kind === 'comment' ? wpComment.name : kind === 'post' ? wpPost.name : wpPage.name,
      entryId,
    })
  }

  /**
   * All of one item's comments, real threading resolved before a reply is
   * written (a reply needs its parent's *new* id, not its WordPress one).
   * Processed in waves — every comment whose parent is already resolved (or
   * top-level) goes this pass, repeat until nothing is left or nothing
   * progressed. A WXR's own comments are almost always one level deep, so
   * this is normally one or two waves; a comment whose parent never
   * resolves (a broken export) is reported and imported top-level rather
   * than dropped.
   */
  async function importCommentsForEntry(
    comments: readonly WxrComment[],
    entryCollection: string,
    entryId: string,
    itemTitle: string,
  ): Promise<void> {
    const store = options.comments
    if (store === undefined || comments.length === 0) return

    const byWpId = new Map(comments.map((comment) => [comment.id, comment]))
    const resolvedId = new Map<string, string>()
    const pending = new Set(comments.map((comment) => comment.id))

    while (pending.size > 0) {
      let progressed = false
      for (const wpId of [...pending]) {
        const comment = byWpId.get(wpId)
        if (comment === undefined) {
          pending.delete(wpId)
          continue
        }
        const wpParent = comment.parentId
        const topLevel = wpParent === '' || wpParent === '0'
        const parentStillPending = !topLevel && !resolvedId.has(wpParent) && byWpId.has(wpParent)
        if (parentStillPending) {
          // Its parent is still in this same wave — try again next pass.
          continue
        }
        // A parent id that names no comment anywhere in this export (a
        // broken export, or one the parser skipped) — imported top-level
        // rather than dropped, and reported so the loss is visible.
        const parentTrulyMissing = !topLevel && !resolvedId.has(wpParent) && !byWpId.has(wpParent)
        if (parentTrulyMissing) {
          acc.warnings.push(
            `Comment ${comment.id} on "${itemTitle}" replies to parent comment ${wpParent}, which does not exist in this export; imported as top-level instead.`,
          )
        }

        const plainText = stripHtmlToPlainText(comment.content)
        if (plainText !== comment.content.trim()) {
          acc.warnings.push(
            `Comment ${comment.id} on "${itemTitle}" contained HTML, which contract F does not store (R3); it was reduced to plain text.`,
          )
        }
        if (plainText.length === 0) {
          acc.warnings.push(
            `Comment ${comment.id} on "${itemTitle}" had no text content once stripped; skipped.`,
          )
          pending.delete(wpId)
          progressed = true
          continue
        }

        const email =
          comment.authorEmail.trim().length > 0
            ? comment.authorEmail.trim()
            : `${
                (comment.author || 'anonymous')
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/gu, '.')
                  .replace(/^\.+|\.+$/gu, '') || 'anonymous'
              }@imported.invalid`

        try {
          const created = await store.create({
            collection: entryCollection,
            entryId,
            parentId: topLevel ? null : (resolvedId.get(wpParent) ?? null),
            author: { name: comment.author || 'Anonymous', email },
            body: plainText,
            status: wpApprovedToStatus(comment.approved),
            provenance: 'human',
          })
          resolvedId.set(wpId, created.id)
          acc.imported.comments += 1
          await record('comment', wpId, created.id)
        } catch (error) {
          acc.warnings.push(
            `Comment ${comment.id} on "${itemTitle}" could not be imported: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
        pending.delete(wpId)
        progressed = true
      }
      if (!progressed) break
    }

    // Reachable only by a genuine cycle (A replies to B, B replies to A) —
    // every other case above already resolved or reported its comment and
    // removed it from `pending`. Skipped rather than imported top-level:
    // unlike a missing parent, there is no honest single choice for which
    // one to break the cycle at.
    for (const wpId of pending) {
      acc.warnings.push(
        `Comment ${wpId} on "${itemTitle}" is part of a reply cycle in the export and was skipped.`,
      )
    }
  }

  for (const item of posts) {
    const id = await writeEntry(item, postStore, 'post')
    if (id !== null) {
      acc.imported.posts += 1
      await record('post', item.postId, id)

      if (options.comments !== undefined) {
        await importCommentsForEntry(item.comments, wpPost.name, id, item.title)
        continue
      }

      for (const comment of item.comments) {
        if (comment.approved !== APPROVED) continue
        const createdComment = await commentStore.create({
          status: 'published',
          values: {
            post: id,
            author: comment.author || 'Anonymous',
            authorEmail: comment.authorEmail,
            body: comment.content,
            publishedAt: wpDateToIso(comment.date),
          },
        })
        acc.imported.comments += 1
        await record('comment', comment.id, createdComment.id)
      }
    }
  }

  for (const item of pages) {
    const id = await writeEntry(item, pageStore, 'page')
    if (id !== null) {
      acc.imported.pages += 1
      await record('page', item.postId, id)

      // A real, independent bug (fiche 15 task 7's own instruction to check
      // what this importer does today): WordPress allows comments on a
      // page exactly as it does on a post, and this loop never imported a
      // single one. Fixed here for the real store path. The legacy
      // synthetic `comment` collection (`collections.ts`'s `wpComment`)
      // cannot be fixed the same way: its `post` field is a hard `relation`
      // to the `post` collection specifically (contract A, `onDelete:
      // 'cascade'`), so writing a page's id there is not a bug fix, it is a
      // foreign-key violation waiting to happen — the real reason to prefer
      // the `comments` option instead of extending a model that was never
      // built to hold this.
      if (options.comments !== undefined) {
        await importCommentsForEntry(item.comments, wpPage.name, id, item.title)
      } else if (item.comments.length > 0) {
        acc.warnings.push(
          `"${item.title}" has ${item.comments.length} comment(s) that were not imported: the legacy comment model only supports comments on posts. Pass a \`comments\` store to import them.`,
        )
      }
    }
  }

  if (options.tracking !== undefined && options.runId !== undefined && done.size > 0) {
    acc.warnings.push(
      `Resumed: ${done.size} item(s) already imported by an earlier attempt of this run were not re-created.`,
    )
  }

  const skipped: UnconvertedItem[] = acc.skipped
  return {
    imported: acc.imported,
    redirectsCreated: acc.redirectsCreated,
    skipped,
    unconvertedBlocks: acc.unconvertedBlocks,
    warnings: acc.warnings,
  }
}
