import type { AccessContext, ContentGateway } from '@cogenta/api'
import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { isCogentaError } from '@cogenta/core'
import { describeMedia, type MediaAsset } from '@cogenta/render'
import {
  buildPath,
  type CollectionDefinition,
  type ContentEntry,
  matchPath,
  type TaxonomyDefinition,
  type TaxonomyTerm,
} from '@cogenta/schema'
import {
  type ChromeLink,
  headingAnchor,
  type ImageSource,
  type ResolvedWidget,
  type ResolvedWidgetArea,
  type WidgetAreas,
  type WidgetEntryItem,
  type WidgetFormField,
  type WidgetLink,
  type WidgetTermItem,
} from '@cogenta/theme-kit'
import {
  isWidgetVisible,
  type Widget,
  type WidgetAreaDeclaration,
  type WidgetRequestContext,
  type WidgetSettings,
} from '@cogenta/widgets'

/**
 * Turns the site's stored widgets into the finished view models a theme
 * draws (L30, contract D `theme@1.6`): visibility decided for this request,
 * every entry read through the permission-checked gateway, every image
 * described, every date formatted, every string in the page's language.
 *
 * A widget that cannot be resolved (its collection renamed, its menu deleted,
 * its image gone) is left out of the page, never rendered broken: the admin
 * still lists it, and the site keeps working.
 */

export interface WidgetRenderRequest {
  /** Everything but `signedIn` and `now`, which the resolver knows itself. */
  readonly context: Omit<WidgetRequestContext, 'signedIn' | 'now'>
  /** The entry being shown, for the widgets that read it (related entries, table of contents). */
  readonly entry?: {
    readonly collection: CollectionDefinition
    readonly entry: ContentEntry
    readonly blocks: readonly VocabularyBlock[]
  }
}

export interface TermUsageCount {
  readonly own: number
  readonly withDescendants: number
}

export interface CommentSummary {
  readonly authorName: string
  readonly body: string
  readonly collection: string
  readonly entryId: string
  readonly createdAt: string
}

export interface FormSummary {
  readonly name: string
  readonly label: string
  readonly active: boolean
  readonly multiStep: boolean
  readonly captcha: boolean
  readonly fields: readonly {
    readonly name: string
    readonly label: string
    readonly kind: string
    readonly required: boolean
    readonly help?: string
    readonly choices?: readonly string[]
    readonly consentText?: string
    readonly conditional: boolean
  }[]
}

export interface WidgetResolverDeps {
  readonly widgets: () => Promise<readonly Widget[]>
  readonly areas: () => Promise<readonly WidgetAreaDeclaration[]>
  readonly site: {
    readonly url: string
    readonly defaultLocale: string
    readonly locales: readonly string[]
  }
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
  readonly gateway: ContentGateway
  readonly terms: (taxonomy: TaxonomyDefinition) => Promise<readonly TaxonomyTerm[]>
  readonly termUsage: (
    taxonomy: TaxonomyDefinition,
    terms: readonly TaxonomyTerm[],
    access: AccessContext,
  ) => Promise<ReadonlyMap<string, TermUsageCount>>
  readonly entriesForTerm: (
    taxonomy: string,
    termId: string,
  ) => Promise<readonly { readonly collection: string; readonly id: string }[]>
  readonly loadMedia?: (ids: readonly string[]) => Promise<ReadonlyMap<string, MediaAsset>>
  readonly imageEndpoint: string
  readonly menuLinks: (
    menuId: string,
    locale: string,
    access: AccessContext,
  ) => Promise<readonly WidgetLink[] | null>
  readonly recentComments: (limit: number) => Promise<readonly CommentSummary[]>
  readonly popularPaths?: (
    since: Date,
    limit: number,
  ) => Promise<readonly { readonly path: string; readonly views: number }[]>
  readonly form: (name: string) => Promise<FormSummary | null>
  readonly social: (locale: string) => Promise<readonly ChromeLink[]>
  readonly now?: () => Date
}

interface WidgetStrings {
  readonly search: string
  readonly searchButton: string
  readonly nothing: string
  readonly noComments: string
  readonly choose: string
  readonly send: string
  readonly previousMonth: string
  readonly nextMonth: string
  readonly postsOn: string
}

const STRINGS: Record<string, WidgetStrings> = {
  en: {
    search: 'Search this site',
    searchButton: 'Search',
    nothing: 'Nothing to show yet.',
    noComments: 'No comments yet.',
    choose: 'Choose…',
    send: 'Send',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    postsOn: 'Published on {date}',
  },
  fr: {
    search: 'Rechercher sur le site',
    searchButton: 'Rechercher',
    nothing: 'Rien à afficher pour l’instant.',
    noComments: 'Aucun commentaire pour l’instant.',
    choose: 'Choisir…',
    send: 'Envoyer',
    previousMonth: 'Mois précédent',
    nextMonth: 'Mois suivant',
    postsOn: 'Publié le {date}',
  },
}

export function widgetStrings(locale: string): WidgetStrings {
  const base = locale.split('-')[0]?.toLowerCase() ?? 'en'
  return STRINGS[base] ?? (STRINGS.en as WidgetStrings)
}

const EXCERPT_FIELDS = ['excerpt', 'summary', 'description', 'subtitle', 'teaser']
const IMAGE_FIELDS = [
  'coverImage',
  'cover',
  'image',
  'featuredImage',
  'photo',
  'thumbnail',
  'seoImage',
]
const TITLE_FIELDS = ['title', 'name', 'label']
const ARCHIVE_SCAN_LIMIT = 1000

function titleOf(entry: ContentEntry): string {
  for (const field of TITLE_FIELDS) {
    const value = entry.values[field]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return entry.id
}

function excerptOf(entry: ContentEntry): string | null {
  for (const field of EXCERPT_FIELDS) {
    const value = entry.values[field]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

function imageIdOf(entry: ContentEntry): string | null {
  for (const field of IMAGE_FIELDS) {
    const value = entry.values[field]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

function hrefOf(collection: CollectionDefinition, entry: ContentEntry): string | null {
  if (collection.routing === undefined) return null
  try {
    return buildPath(
      collection,
      Object.fromEntries(
        Object.entries(entry.values).filter(
          (pair): pair is [string, string] => typeof pair[1] === 'string',
        ),
      ),
      collection.routing.locale === true ? (entry.locale ?? undefined) : undefined,
    )
  } catch (error) {
    if (isCogentaError(error) && error.code === 'CONTENT_ROUTE_INVALID') return null
    throw error
  }
}

function dateOf(entry: ContentEntry): string {
  return entry.publishedAt ?? entry.createdAt
}

/** A frame source for the providers every theme's `embed` block already trusts; anything else is a link. */
export function embedFrameSource(rawUrl: string): string | null {
  const url = URL.parse(rawUrl)
  if (url === null || url.protocol !== 'https:') return null
  const segments = url.pathname.split('/').filter((segment) => segment !== '')
  const host = url.hostname.replace(/^www\./u, '')
  if (host === 'youtu.be')
    return segments[0] === undefined
      ? null
      : `https://www.youtube-nocookie.com/embed/${segments[0]}`
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id =
      url.searchParams.get('v') ??
      (segments[0] === 'embed' || segments[0] === 'shorts' ? segments[1] : undefined)
    return id === undefined || id === null ? null : `https://www.youtube-nocookie.com/embed/${id}`
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = segments.find((segment) => /^\d+$/u.test(segment))
    return id === undefined ? null : `https://player.vimeo.com/video/${id}`
  }
  if (host === 'open.spotify.com') {
    const [kind, id] = segments
    return kind === undefined || id === undefined
      ? null
      : `https://open.spotify.com/embed/${kind}/${id}`
  }
  return null
}

function plainText(block: { readonly children?: readonly { readonly text?: string }[] }): string {
  return (block.children ?? []).map((child) => child.text ?? '').join('')
}

export async function resolveWidgetAreas(
  deps: WidgetResolverDeps,
  request: WidgetRenderRequest,
  access: AccessContext,
): Promise<WidgetAreas> {
  const now = deps.now?.() ?? new Date()
  const context: WidgetRequestContext = {
    ...request.context,
    signedIn: access.actor.id !== null,
    now,
  }
  const [stored, declared] = await Promise.all([deps.widgets(), deps.areas()])
  const visible = stored.filter((widget) => isWidgetVisible(widget, context))
  if (visible.length === 0) return {}

  const locale = context.locale
  const strings = widgetStrings(locale)
  const collectionsByName = new Map(
    deps.collections.map((collection) => [collection.name, collection]),
  )
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
  const formatDate = (iso: string): string => {
    const parsed = new Date(iso)
    return Number.isNaN(parsed.getTime()) ? iso : dateFormat.format(parsed)
  }

  // Media is loaded once for the whole page, after every widget said which ids it needs.
  const mediaIds = new Set<string>()
  let media: ReadonlyMap<string, MediaAsset> = new Map()
  const imageFor = (id: string | null | undefined): ImageSource | null => {
    if (id === null || id === undefined) return null
    const asset = media.get(id)
    if (asset === undefined) return null
    return describeMedia(
      asset,
      {},
      { endpoint: deps.imageEndpoint, mediaEndpoint: deps.imageEndpoint },
    )
  }

  const entryItem = (
    collection: CollectionDefinition,
    entry: ContentEntry,
    show: { readonly date: boolean; readonly excerpt: boolean; readonly image: boolean },
  ): (() => WidgetEntryItem) => {
    const imageId = show.image ? imageIdOf(entry) : null
    if (imageId !== null) mediaIds.add(imageId)
    return () => ({
      title: titleOf(entry),
      href: hrefOf(collection, entry),
      date: show.date ? formatDate(dateOf(entry)) : null,
      datetime: show.date ? dateOf(entry) : null,
      excerpt: show.excerpt ? excerptOf(entry) : null,
      image: imageFor(imageId),
    })
  }

  const readEntry = async (collectionName: string, id: string): Promise<ContentEntry | null> => {
    if (!collectionsByName.has(collectionName)) return null
    try {
      return await deps.gateway.read(collectionName, id, access)
    } catch {
      return null
    }
  }

  const archiveScan = async (collectionName: string): Promise<readonly ContentEntry[]> => {
    const found: ContentEntry[] = []
    let cursor: string | undefined
    try {
      while (found.length < ARCHIVE_SCAN_LIMIT) {
        const page = await deps.gateway.list(
          {
            collection: collectionName,
            limit: 100,
            sort: [{ field: 'createdAt', direction: 'desc' }],
            ...(cursor === undefined ? {} : { cursor }),
          },
          access,
        )
        found.push(...page.items)
        if (page.nextCursor === null || page.nextCursor === undefined) break
        cursor = page.nextCursor
      }
    } catch {
      return found
    }
    return found
  }

  type Pending = () => ResolvedWidget | null

  const resolveOne = async (widget: Widget): Promise<Pending | null> => {
    const base = {
      id: widget.id,
      title: widget.title,
      devices: widget.visibility.devices,
    }
    const settings = widget.settings as Record<string, unknown>
    switch (widget.type) {
      case 'text':
        // A text widget carries words and links; its media nodes are left out
        // (an image widget places a picture), and every link to an entry is
        // resolved here, because the footer renders without a page context.
        return await (async () => {
          const document = settings['body'] as RichTextDocument
          const resolved: RichTextDocument = []
          for (const node of document) {
            if (node._type !== 'block') {
              if (node._type === 'hr') resolved.push(node)
              continue
            }
            const markDefs = []
            for (const definition of node.markDefs) {
              if (definition._type === 'link') {
                markDefs.push(definition)
                continue
              }
              const collection = collectionsByName.get(definition.collection)
              const target = await readEntry(definition.collection, definition.id)
              const href =
                collection === undefined || target === null ? null : hrefOf(collection, target)
              if (href !== null)
                markDefs.push({ _key: definition._key, _type: 'link' as const, href })
            }
            resolved.push({ ...node, markDefs })
          }
          return () => ({ ...base, type: 'text' as const, body: resolved })
        })()
      case 'image': {
        const value = settings as WidgetSettings<'image'>
        mediaIds.add(value.media)
        return () => {
          const image = imageFor(value.media)
          if (image === null) return null
          return {
            ...base,
            type: 'image',
            image: value.alt === '' ? image : { ...image, alt: value.alt },
            caption: value.caption,
            href: value.href ?? null,
          }
        }
      }
      case 'gallery': {
        const value = settings as WidgetSettings<'gallery'>
        for (const id of value.media) mediaIds.add(id)
        return () => {
          const images = value.media
            .map(imageFor)
            .filter((image): image is ImageSource => image !== null)
          return images.length === 0
            ? null
            : { ...base, type: 'gallery', images, columns: value.columns }
        }
      }
      case 'embed': {
        const value = settings as WidgetSettings<'embed'>
        return () => ({
          ...base,
          type: 'embed',
          url: value.url,
          caption: value.caption,
          frameSrc: embedFrameSource(value.url),
        })
      }
      case 'quote': {
        const value = settings as WidgetSettings<'quote'>
        return () => ({
          ...base,
          type: 'quote',
          text: value.text,
          attribution: value.attribution,
          role: value.role,
        })
      }
      case 'cta': {
        const value = settings as WidgetSettings<'cta'>
        return () => ({
          ...base,
          type: 'cta',
          heading: value.heading,
          body: value.body,
          action: { label: value.label, href: value.href, newTab: false },
        })
      }
      case 'links': {
        const value = settings as WidgetSettings<'links'>
        return () => ({
          ...base,
          type: 'links',
          items: value.items.map((item) => ({ ...item, current: item.href === context.path })),
        })
      }
      case 'contact': {
        const value = settings as WidgetSettings<'contact'>
        return () => ({ ...base, type: 'contact', ...value })
      }
      case 'about': {
        const value = settings as WidgetSettings<'about'>
        if (value.media !== undefined) mediaIds.add(value.media)
        return () => ({
          ...base,
          type: 'about',
          image: imageFor(value.media),
          heading: value.heading,
          body: value.body,
          link: value.link === undefined ? null : { ...value.link },
        })
      }
      case 'recentEntries': {
        const value = settings as WidgetSettings<'recentEntries'>
        const collection = collectionsByName.get(value.collection)
        if (collection === undefined) return null
        const show = { date: value.showDate, excerpt: value.showExcerpt, image: value.showImage }
        let entries: readonly ContentEntry[]
        if (value.taxonomy !== undefined && value.termId !== undefined) {
          const ids = (await deps.entriesForTerm(value.taxonomy, value.termId)).filter(
            (item) => item.collection === collection.name,
          )
          const read: ContentEntry[] = []
          for (const item of ids) {
            if (read.length >= value.count) break
            const found = await readEntry(item.collection, item.id)
            if (found !== null) read.push(found)
          }
          entries = read
        } else {
          try {
            entries = (
              await deps.gateway.list(
                {
                  collection: collection.name,
                  limit: value.count + 1,
                  sort: [{ field: 'createdAt', direction: 'desc' }],
                },
                access,
              )
            ).items
          } catch {
            return null
          }
        }
        const items = entries
          .filter((entry) => !(request.entry?.entry.id === entry.id))
          .slice(0, value.count)
          .map((entry) => entryItem(collection, entry, show))
        return () => ({
          ...base,
          type: 'entries',
          variant: 'recent',
          empty: strings.nothing,
          items: items.map((item) => item()),
        })
      }
      case 'relatedEntries': {
        const value = settings as WidgetSettings<'relatedEntries'>
        const current = request.entry
        if (current === undefined) return null
        const show = { date: value.showDate, excerpt: false, image: value.showImage }
        const score = new Map<string, { collection: string; hits: number }>()
        for (const [fieldName, field] of Object.entries(current.collection.fields)) {
          if (field.kind !== 'taxonomy') continue
          const taxonomy = String(field.options['of'] ?? '')
          const raw = current.entry.values[fieldName]
          const termIds = Array.isArray(raw)
            ? raw.map(String)
            : typeof raw === 'string'
              ? [raw]
              : []
          for (const termId of termIds) {
            for (const item of await deps.entriesForTerm(taxonomy, termId)) {
              if (item.id === current.entry.id) continue
              const known = score.get(item.id) ?? { collection: item.collection, hits: 0 }
              score.set(item.id, { collection: item.collection, hits: known.hits + 1 })
            }
          }
        }
        const ranked = [...score.entries()].sort((a, b) => b[1].hits - a[1].hits)
        const items: (() => WidgetEntryItem)[] = []
        for (const [id, { collection: name }] of ranked) {
          if (items.length >= value.count) break
          const collection = collectionsByName.get(name)
          const found = await readEntry(name, id)
          if (collection === undefined || found === null) continue
          items.push(entryItem(collection, found, show))
        }
        if (items.length < value.count) {
          // Nothing shares a term: the entry's newest neighbours are the honest next best.
          try {
            const neighbours = await deps.gateway.list(
              {
                collection: current.collection.name,
                limit: value.count + 1,
                sort: [{ field: 'createdAt', direction: 'desc' }],
              },
              access,
            )
            for (const found of neighbours.items) {
              if (items.length >= value.count) break
              if (found.id === current.entry.id || score.has(found.id)) continue
              items.push(entryItem(current.collection, found, show))
            }
          } catch {
            // The collection may not be listable by this visitor; the widget shows what it has.
          }
        }
        if (items.length === 0) return null
        return () => ({
          ...base,
          type: 'entries',
          variant: 'related',
          empty: strings.nothing,
          items: items.map((item) => item()),
        })
      }
      case 'popularEntries': {
        const value = settings as WidgetSettings<'popularEntries'>
        if (deps.popularPaths === undefined) return null
        const since = new Date(now.getTime() - value.days * 86_400_000)
        const show = { date: false, excerpt: false, image: value.showImage }
        const items: (() => WidgetEntryItem)[] = []
        for (const { path } of await deps.popularPaths(since, 50)) {
          if (items.length >= value.count) break
          const match = matchPath(deps.collections, path, {
            locales: deps.site.locales,
            defaultLocale: deps.site.defaultLocale,
          })
          if (match === null) continue
          if (value.collection !== undefined && match.collection !== value.collection) continue
          const collection = collectionsByName.get(match.collection)
          if (collection === undefined) continue
          const conditions = Object.entries(match.params).map(([field, fieldValue]) => ({
            field,
            operator: 'eq' as const,
            value: fieldValue,
          }))
          try {
            const page = await deps.gateway.list(
              {
                collection: match.collection,
                limit: 1,
                ...(conditions.length === 0
                  ? {}
                  : { filter: conditions.length === 1 ? conditions[0] : { and: conditions } }),
              },
              access,
            )
            const found = page.items[0]
            if (found !== undefined && found.id !== request.entry?.entry.id) {
              items.push(entryItem(collection, found, show))
            }
          } catch {
            // A path whose entry this visitor may not read is simply not listed.
          }
        }
        if (items.length === 0) return null
        return () => ({
          ...base,
          type: 'entries',
          variant: 'popular',
          empty: strings.nothing,
          items: items.map((item) => item()),
        })
      }
      case 'terms':
      case 'tagCloud': {
        const value = settings as WidgetSettings<'terms'> & WidgetSettings<'tagCloud'>
        const taxonomy = deps.taxonomies.find((candidate) => candidate.name === value.taxonomy)
        if (taxonomy === undefined) return null
        const terms = await deps.terms(taxonomy)
        const usage = await deps.termUsage(taxonomy, terms, access)
        const hrefFor = (term: TaxonomyTerm): string =>
          `/${encodeURIComponent(taxonomy.name)}/${encodeURIComponent(term.slug)}`
        const labelOf = (term: TaxonomyTerm): string =>
          term.labels[locale] ??
          term.labels[deps.site.defaultLocale] ??
          Object.values(term.labels)[0] ??
          term.slug
        const current = (term: TaxonomyTerm): boolean =>
          context.kind === 'taxonomy' &&
          context.taxonomy === taxonomy.name &&
          context.termId === term.id
        if (widget.type === 'tagCloud') {
          const counted = terms
            .map((term) => ({ term, count: usage.get(term.id)?.own ?? 0 }))
            .filter((item) => item.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, value.maxTerms)
          if (counted.length === 0) return null
          const max = Math.max(...counted.map((item) => item.count))
          const min = Math.min(...counted.map((item) => item.count))
          const weightOf = (count: number): 1 | 2 | 3 | 4 | 5 =>
            max === min
              ? 3
              : (Math.min(5, 1 + Math.floor(((count - min) / (max - min)) * 4.999)) as
                  | 1
                  | 2
                  | 3
                  | 4
                  | 5)
          const items = counted
            .sort((a, b) => labelOf(a.term).localeCompare(labelOf(b.term), locale))
            .map(({ term, count }) => ({
              label: labelOf(term),
              href: hrefFor(term),
              count: value.showCounts ? count : null,
              depth: 0,
              current: current(term),
              weight: weightOf(count),
            }))
          return () => ({ ...base, type: 'tagCloud', items })
        }
        const items: WidgetTermItem[] = terms
          .filter((term) => !value.hideEmpty || (usage.get(term.id)?.withDescendants ?? 0) > 0)
          .map((term) => ({
            label: labelOf(term),
            href: hrefFor(term),
            count: value.showCounts
              ? value.hierarchical
                ? (usage.get(term.id)?.withDescendants ?? 0)
                : (usage.get(term.id)?.own ?? 0)
              : null,
            depth: value.hierarchical ? term.depth : 0,
            current: current(term),
          }))
        if (items.length === 0) return null
        return () => ({
          ...base,
          type: 'terms',
          display: value.display,
          prompt: strings.choose,
          items,
        })
      }
      case 'archives':
      case 'calendar': {
        const value = settings as WidgetSettings<'archives'> & WidgetSettings<'calendar'>
        const collection = collectionsByName.get(value.collection)
        if (collection === undefined) return null
        const entries = await archiveScan(collection.name)
        if (entries.length === 0) return null
        if (widget.type === 'archives') {
          const buckets = new Map<string, number>()
          for (const entry of entries) {
            const iso = dateOf(entry)
            const key = value.granularity === 'year' ? iso.slice(0, 4) : iso.slice(0, 7)
            buckets.set(key, (buckets.get(key) ?? 0) + 1)
          }
          const monthFormat = new Intl.DateTimeFormat(locale, {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })
          const items: WidgetTermItem[] = [...buckets.entries()]
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, value.limit)
            .map(([key, count]) => {
              const [year, month] = key.split('-')
              const href = `/archive/${encodeURIComponent(collection.name)}/${year}${month === undefined ? '' : `/${month}`}`
              return {
                label:
                  month === undefined
                    ? String(year)
                    : monthFormat.format(new Date(`${key}-01T00:00:00Z`)),
                href,
                count: value.showCounts ? count : null,
                depth: 0,
                current: context.kind === 'dateArchive' && context.path === href,
              }
            })
          return () => ({
            ...base,
            type: 'archives',
            display: value.display,
            prompt: strings.choose,
            items,
          })
        }
        // Calendar: the month the page is about when it is a date archive, else this month.
        const pathMonth = /^\/archive\/[^/]+\/(\d{4})\/(\d{2})$/u.exec(context.path)
        const year = pathMonth === null ? now.getUTCFullYear() : Number(pathMonth[1])
        const month = pathMonth === null ? now.getUTCMonth() : Number(pathMonth[2]) - 1
        const key = (y: number, m: number): string => `${y}-${String(m + 1).padStart(2, '0')}`
        const byDay = new Map<number, number>()
        const months = new Set<string>()
        for (const entry of entries) {
          const iso = dateOf(entry)
          months.add(iso.slice(0, 7))
          if (iso.slice(0, 7) === key(year, month)) {
            const day = Number(iso.slice(8, 10))
            byDay.set(day, (byDay.get(day) ?? 0) + 1)
          }
        }
        const first = new Date(Date.UTC(year, month, 1))
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
        const offset = (first.getUTCDay() + 6) % 7 // Monday first
        const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
        const weekdays = Array.from({ length: 7 }, (_, index) =>
          weekdayFormat.format(new Date(Date.UTC(2024, 0, 1 + index))),
        )
        const monthHref = `/archive/${encodeURIComponent(collection.name)}/${year}/${String(month + 1).padStart(2, '0')}`
        const cells: ({ day: number; href: string | null; label: string } | null)[] = []
        for (let index = 0; index < offset; index += 1) cells.push(null)
        for (let day = 1; day <= daysInMonth; day += 1) {
          const iso = new Date(Date.UTC(year, month, day)).toISOString()
          cells.push({
            day,
            href: byDay.has(day) ? monthHref : null,
            label: widgetStrings(locale).postsOn.replace('{date}', formatDate(iso)),
          })
        }
        while (cells.length % 7 !== 0) cells.push(null)
        const weeks = Array.from({ length: cells.length / 7 }, (_, index) =>
          cells.slice(index * 7, index * 7 + 7),
        )
        const sortedMonths = [...months].sort()
        const currentKey = key(year, month)
        const previousKey = [...sortedMonths].reverse().find((candidate) => candidate < currentKey)
        const nextKey = sortedMonths.find((candidate) => candidate > currentKey)
        const linkTo = (candidate: string | undefined, label: string): WidgetLink | null => {
          if (candidate === undefined) return null
          const [y, m] = candidate.split('-')
          return {
            label,
            href: `/archive/${encodeURIComponent(collection.name)}/${y}/${m}`,
            newTab: false,
          }
        }
        return () => ({
          ...base,
          type: 'calendar',
          caption: new Intl.DateTimeFormat(locale, {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(first),
          weekdays,
          weeks,
          previous: linkTo(previousKey, strings.previousMonth),
          next: linkTo(nextKey, strings.nextMonth),
        })
      }
      case 'recentComments': {
        const value = settings as WidgetSettings<'recentComments'>
        const comments = await deps.recentComments(value.count * 2)
        const items: {
          author: string
          entryTitle: string
          href: string | null
          excerpt: string
          date: string
          datetime: string
        }[] = []
        for (const comment of comments) {
          if (items.length >= value.count) break
          const collection = collectionsByName.get(comment.collection)
          const entry = await readEntry(comment.collection, comment.entryId)
          if (collection === undefined || entry === null) continue
          const href = hrefOf(collection, entry)
          const body = comment.body.replace(/\s+/gu, ' ').trim()
          items.push({
            author: comment.authorName,
            entryTitle: titleOf(entry),
            href: href === null ? null : `${href}#cg-comments`,
            excerpt: body.length > 120 ? `${body.slice(0, 117).trimEnd()}…` : body,
            date: formatDate(comment.createdAt),
            datetime: comment.createdAt,
          })
        }
        return () => ({ ...base, type: 'comments', empty: strings.noComments, items })
      }
      case 'search': {
        const value = settings as WidgetSettings<'search'>
        return () => ({
          ...base,
          type: 'search',
          action: '/search',
          label: strings.search,
          placeholder: value.placeholder,
          button: strings.searchButton,
        })
      }
      case 'menu': {
        const value = settings as WidgetSettings<'menu'>
        const links = await deps.menuLinks(value.menuId, locale, access)
        if (links === null || links.length === 0) return null
        return () => ({
          ...base,
          type: 'links',
          items: links.map((link) => ({ ...link, current: link.href === context.path })),
        })
      }
      case 'social': {
        const value = settings as WidgetSettings<'social'>
        const items =
          value.items === undefined
            ? await deps.social(locale)
            : value.items.map((item) => ({ label: item.label, href: item.href }))
        if (items.length === 0) return null
        return () => ({ ...base, type: 'social', items })
      }
      case 'form': {
        const value = settings as WidgetSettings<'form'>
        const form = await deps.form(value.form)
        if (form === null || !form.active) return null
        const page: WidgetLink = {
          label: form.label,
          href: `/forms/${encodeURIComponent(form.name)}`,
          newTab: false,
        }
        const kinds: Record<string, WidgetFormField['kind']> = {
          text: 'text',
          longText: 'textarea',
          email: 'email',
          phone: 'tel',
          number: 'number',
          date: 'date',
          choiceSingle: 'select',
          consent: 'checkbox',
        }
        const inline =
          !form.multiStep &&
          !form.captcha &&
          form.fields.every((field) => kinds[field.kind] !== undefined && !field.conditional)
        return () => ({
          ...base,
          type: 'form',
          link: inline ? null : page,
          action: `/api/forms/${encodeURIComponent(form.name)}/submit`,
          fields: inline
            ? form.fields.map((field) => ({
                name: field.name,
                label: field.kind === 'consent' ? (field.consentText ?? field.label) : field.label,
                kind: kinds[field.kind] as WidgetFormField['kind'],
                required: field.required,
                choices: field.choices ?? [],
                help: field.help ?? null,
              }))
            : [],
          hidden: { _ts: String(now.getTime()) },
          honeypot: '_gotcha',
          submit: strings.send,
        })
      }
      case 'toc': {
        const value = settings as WidgetSettings<'toc'>
        const current = request.entry
        if (current === undefined) return null
        const levels = new Map([
          ['h2', 2],
          ['h3', 3],
          ['h4', 4],
        ])
        const items: { label: string; href: string; depth: number }[] = []
        const seen = new Map<string, number>()
        for (const block of current.blocks) {
          const body = (block as { readonly body?: unknown }).body
          if (block._type !== 'prose' || !Array.isArray(body)) continue
          for (const node of body as readonly {
            _type?: string
            style?: string
            children?: { text?: string }[]
          }[]) {
            const level = node._type === 'block' ? levels.get(node.style ?? '') : undefined
            if (level === undefined || level > value.maxDepth) continue
            const label = plainText(node)
            if (label.trim() === '') continue
            const anchor = headingAnchor(label)
            const count = seen.get(anchor) ?? 0
            seen.set(anchor, count + 1)
            items.push({
              label,
              href: `#${count === 0 ? anchor : `${anchor}-${count + 1}`}`,
              depth: level - 2,
            })
          }
        }
        if (items.length < 2) return null
        return () => ({ ...base, type: 'toc', items })
      }
    }
  }

  const pending: { area: string; build: Pending }[] = []
  for (const widget of visible) {
    const build = await resolveOne(widget).catch(() => null)
    if (build !== null) pending.push({ area: widget.area, build })
  }

  if (mediaIds.size > 0 && deps.loadMedia !== undefined) {
    media = await deps.loadMedia([...mediaIds])
  }

  const labels = new Map(declared.map((area) => [area.id, area.label]))
  const areas: Record<string, { id: string; label: string; widgets: ResolvedWidget[] }> = {}
  for (const { area, build } of pending) {
    if (!labels.has(area)) continue
    const resolved = build()
    if (resolved === null) continue
    const target = areas[area] ?? { id: area, label: labels.get(area) ?? area, widgets: [] }
    target.widgets.push(resolved)
    areas[area] = target
  }
  return areas as Readonly<Record<string, ResolvedWidgetArea>>
}
