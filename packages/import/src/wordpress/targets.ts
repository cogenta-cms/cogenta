import { CogentaError } from '@cogenta/core'
import type { CollectionDefinition, FieldDefinition } from '@cogenta/schema'
import { wpCategory, wpPage, wpPost, wpTag } from './collections.js'
import { assertWordPressCollectionsCompatible } from './target-preflight.js'

/**
 * Where a WordPress export lands on *this* site.
 *
 * A site made from a template already has its own `post` and `page`
 * collections, shaped for that template (a `summary` rather than an `excerpt`,
 * a rich-text `body` rather than a block zone, no `customFields`…). The
 * importer used to refuse all of those outright, so on any template site the
 * WordPress import simply could not run. This module reads the site's own
 * definitions and decides, field by field, where each WordPress datum goes:
 *
 *  - a collection the site does not declare, or declares in exactly the shape
 *    the importer writes (`native`), is used as before;
 *  - any other collection is **mapped**: its title, slug, excerpt, body,
 *    publication date, author, cover image and — when it has them — category
 *    and tag relations are located by kind and conventional name, and what has
 *    no counterpart is reported rather than invented.
 *
 * Nothing here migrates a schema (ADR-0010): a mapped import writes through
 * the site's own definitions, validated by its own store, into columns that
 * already exist.
 */

export type WordPressTarget = 'post' | 'page'

/** Which collection each kind of WordPress item is imported into. Absent means "the one named `post`/`page`". */
export interface WordPressTargetChoice {
  readonly post?: string
  readonly page?: string
}

export interface WordPressBodyTarget {
  readonly field: string
  readonly kind: 'blocks' | 'richText'
}

export interface WordPressEntryTarget {
  /** The definition the store is built from: the site's own when `native` is false. */
  readonly collection: CollectionDefinition
  /** `true` when the collection is absent from the site or exactly the importer's own shape. */
  readonly native: boolean
  readonly title: string
  readonly slug: string | null
  readonly excerpt: string | null
  readonly body: WordPressBodyTarget | null
  readonly publishedAt: string | null
  /** A plain text field that receives the author's display name. */
  readonly author: string | null
  /** A media field that receives the featured image. */
  readonly cover: string | null
  readonly customFields: string | null
  readonly category: string | null
  readonly tags: string | null
  /** Required text fields with no WordPress counterpart: they are filled with the title, never left to fail validation. */
  readonly fillWithTitle: readonly string[]
}

export interface WordPressTargetPlan {
  readonly post: WordPressEntryTarget
  readonly page: WordPressEntryTarget
  /** `null` when the site has no category collection to receive them: they are then reported, not written to an invisible table. */
  readonly category: CollectionDefinition | null
  readonly tag: CollectionDefinition | null
}

const EXCERPT_NAMES = ['excerpt', 'summary', 'description', 'chapo', 'intro', 'lede', 'abstract']
const BODY_NAMES = ['body', 'content', 'blocks', 'text', 'main']
const DATE_NAMES = ['publishedAt', 'publishedOn', 'date', 'publishDate', 'published']
const AUTHOR_NAMES = ['author', 'authorName', 'byline', 'writer']
const COVER_NAMES = ['coverImage', 'cover', 'featuredImage', 'image', 'thumbnail', 'hero', 'heroImage']
const CUSTOM_NAMES = ['customFields', 'meta', 'metadata']

function entriesOf(collection: CollectionDefinition): readonly [string, FieldDefinition][] {
  return Object.entries(collection.fields)
}

/** The first field of one of `kinds`, preferring the conventional `names` in order. */
function pick(
  collection: CollectionDefinition,
  kinds: readonly string[],
  names: readonly string[],
  taken: ReadonlySet<string>,
  fallbackToAnyOfKind = false,
): string | null {
  for (const name of names) {
    const field = collection.fields[name]
    if (field !== undefined && kinds.includes(field.kind) && !taken.has(name)) return name
  }
  if (!fallbackToAnyOfKind) return null
  for (const [name, field] of entriesOf(collection)) {
    if (kinds.includes(field.kind) && !taken.has(name)) return name
  }
  return null
}

function nativeTarget(collection: CollectionDefinition, kind: WordPressTarget): WordPressEntryTarget {
  return {
    collection,
    native: true,
    title: 'title',
    slug: 'slug',
    excerpt: kind === 'post' ? 'excerpt' : null,
    body: { field: 'body', kind: 'blocks' },
    publishedAt: 'publishedAt',
    author: null,
    cover: null,
    customFields: 'customFields',
    category: kind === 'post' ? 'category' : null,
    tags: kind === 'post' ? 'tags' : null,
    fillWithTitle: [],
  }
}

function unsuitable(collection: string, reasons: readonly string[]): CogentaError {
  return new CogentaError({
    code: 'IMPORT_MAPPING_INVALID',
    message: `The "${collection}" collection cannot receive a WordPress import: ${reasons.join('; ')}.`,
    hint: 'Choose another target collection for this content type, or add a plain text title field to this one.',
    details: { collection, reasons },
  })
}

/** Maps a WordPress post/page onto a collection the site declared for itself. */
function mappedTarget(
  collection: CollectionDefinition,
  categoryCollection: CollectionDefinition | null,
  tagCollection: CollectionDefinition | null,
): WordPressEntryTarget {
  const taken = new Set<string>()
  const claim = (name: string | null): string | null => {
    if (name !== null) taken.add(name)
    return name
  }

  const title = claim(pick(collection, ['text'], ['title', 'name', 'headline'], taken, true))
  if (title === null) throw unsuitable(collection.name, ['it has no text field to hold the title'])
  const slug = claim(pick(collection, ['slug'], ['slug'], taken, true))
  const bodyName =
    pick(collection, ['blocks'], BODY_NAMES, taken, true) ??
    pick(collection, ['richText'], BODY_NAMES, taken, true)
  claim(bodyName)
  const bodyKind = bodyName === null ? null : (collection.fields[bodyName]?.kind ?? null)
  const body: WordPressBodyTarget | null =
    bodyName !== null && (bodyKind === 'blocks' || bodyKind === 'richText')
      ? { field: bodyName, kind: bodyKind }
      : null
  const excerpt = claim(pick(collection, ['text'], EXCERPT_NAMES, taken))
  const publishedAt = claim(pick(collection, ['datetime', 'date'], DATE_NAMES, taken))
  const author = claim(pick(collection, ['text'], AUTHOR_NAMES, taken))
  const cover = claim(pick(collection, ['media'], COVER_NAMES, taken))
  const customFields = claim(pick(collection, ['json'], CUSTOM_NAMES, taken))

  const relationTo = (to: CollectionDefinition | null, many: boolean): string | null => {
    if (to === null) return null
    for (const [name, field] of entriesOf(collection)) {
      if (field.kind !== 'relation' || taken.has(name)) continue
      const options = field.options as { to?: unknown; many?: unknown }
      if (options.to === to.name && (options.many === true) === many) return claim(name)
    }
    return null
  }
  const category = relationTo(categoryCollection, false)
  const tags = relationTo(tagCollection, true)

  const fillWithTitle = entriesOf(collection)
    .filter(
      ([name, field]) => field.required === true && !taken.has(name) && field.kind === 'text',
    )
    .map(([name]) => name)
  const stuck = entriesOf(collection)
    .filter(
      ([name, field]) =>
        field.required === true &&
        !taken.has(name) &&
        field.kind !== 'text' &&
        field.kind !== 'boolean',
    )
    .map(([name, field]) => `the required ${field.kind} field "${name}" has no WordPress counterpart`)
  if (stuck.length > 0) throw unsuitable(collection.name, stuck)

  return {
    collection,
    native: false,
    title,
    slug,
    excerpt,
    body,
    publishedAt,
    author,
    cover,
    customFields,
    category,
    tags,
    fillWithTitle,
  }
}

function isCompatible(collection: CollectionDefinition): boolean {
  try {
    assertWordPressCollectionsCompatible([collection])
    return true
  } catch {
    return false
  }
}

/** A category/tag collection the importer can write names and slugs into, or `null`. */
function termCollection(
  site: readonly CollectionDefinition[],
  name: 'category' | 'tag',
  postIsNative: boolean,
): CollectionDefinition | null {
  const current = site.find((collection) => collection.name === name)
  if (current === undefined) return postIsNative ? (name === 'category' ? wpCategory : wpTag) : null
  return isCompatible(current) ? current : null
}

/**
 * Decides where every WordPress content type goes on this site, or throws
 * `IMPORT_MAPPING_INVALID` (naming the collection and every reason) when a
 * chosen collection cannot receive one. Pure: no database, so analysis and
 * apply reach the same answer.
 */
export function planWordPressTargets(
  site: readonly CollectionDefinition[],
  choice: WordPressTargetChoice = {},
): WordPressTargetPlan {
  const find = (name: string): CollectionDefinition => {
    const found = site.find((collection) => collection.name === name)
    if (found === undefined) {
      throw new CogentaError({
        code: 'IMPORT_MAPPING_INVALID',
        message: `The site declares no "${name}" collection.`,
        hint: 'Pick one of the collections this site declares as the import target.',
        details: { collection: name },
      })
    }
    return found
  }

  const chosenPost = choice.post === undefined ? undefined : find(choice.post)
  const chosenPage = choice.page === undefined ? undefined : find(choice.page)
  const sitePost = chosenPost ?? site.find((collection) => collection.name === 'post')
  const sitePage = chosenPage ?? site.find((collection) => collection.name === 'page')

  const postNative = sitePost === undefined || (chosenPost === undefined && isCompatible(sitePost))
  const category = termCollection(site, 'category', postNative)
  const tag = termCollection(site, 'tag', postNative)

  const post = postNative
    ? nativeTarget(sitePost ?? wpPost, 'post')
    : mappedTarget(sitePost as CollectionDefinition, category, tag)
  const page =
    sitePage === undefined || (chosenPage === undefined && isCompatible(sitePage))
      ? nativeTarget(sitePage ?? wpPage, 'page')
      : mappedTarget(sitePage, null, null)

  return { post, page, category, tag }
}
