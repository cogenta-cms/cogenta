import type { ContentClient, ContentEntry, MediaReference, Page } from '../content/types.js'
import type { ImageOptions, ImageSource, RenderContext } from '../context/types.js'
import { collectionTag, entryTag, mediaTag, pathTag } from './tags.js'

/**
 * Collects, during a render, what the page actually read.
 *
 * This is the part that has to be automatic. A theme declaring its own
 * dependencies is wrong the first time someone adds a `ctx.content.list()` and
 * forgets to update the declaration — and the symptom is a page serving stale
 * content for as long as the cache lives, which nobody notices until a reader
 * complains. Wrapping the two doors to data (`ctx.content` and `ctx.image`)
 * means the dependency set is a consequence of the render, not a claim about
 * it.
 */
export interface ReadRecorder {
  /** Tags accumulated so far. A fresh array on each call — never the live set. */
  tags(): readonly string[]
  recordEntry(id: string): void
  recordCollection(collection: string): void
  recordMedia(id: string): void
  recordPath(path: string): void
}

export function createReadRecorder(): ReadRecorder {
  const tags = new Set<string>()

  return {
    tags: () => [...tags],
    recordEntry: (id) => void tags.add(entryTag(id)),
    recordCollection: (collection) => void tags.add(collectionTag(collection)),
    recordMedia: (id) => void tags.add(mediaTag(id)),
    recordPath: (path) => void tags.add(pathTag(path)),
  }
}

/**
 * A content client that records every read, and changes nothing else.
 *
 * Note what `list` records: the **collection**, on top of the entries it
 * returned. Tagging only the returned entries is the classic mistake — the
 * front page of a blog would then survive the publication of a new article,
 * because that article was, by definition, not in the cached page. A list
 * depends on the shape of the collection, not on the rows it happened to show.
 */
export function recordingContentClient(
  client: ContentClient,
  recorder: ReadRecorder,
): ContentClient {
  return {
    entry: async (collection, id): Promise<ContentEntry | null> => {
      // Recorded before awaiting, and whatever comes back: a page that renders
      // "not found" for a missing entry must be dropped when that entry appears.
      recorder.recordEntry(id)
      return client.entry(collection, id)
    },

    byPath: async (path): Promise<ContentEntry | null> => {
      recorder.recordPath(path)
      const entry = await client.byPath(path)
      if (entry !== null) recorder.recordEntry(entry.id)
      return entry
    },

    list: async (request): Promise<Page<ContentEntry>> => {
      recorder.recordCollection(request.collection)
      const page = await client.list(request)
      for (const item of page.items) recorder.recordEntry(item.id)
      return page
    },
  }
}

/**
 * The render context a page is given while its dependencies are being
 * collected. Same contract D surface, same behaviour; it only remembers.
 */
export function recordingRenderContext(
  context: RenderContext,
  recorder: ReadRecorder,
): RenderContext {
  return {
    ...context,
    content: recordingContentClient(context.content, recorder),
    image: (media: MediaReference, options?: ImageOptions): ImageSource => {
      recorder.recordMedia(media.id)
      return context.image(media, options)
    },
  }
}
