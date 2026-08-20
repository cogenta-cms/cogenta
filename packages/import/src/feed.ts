import { CogentaError } from '@cogenta/core'
import type { GenericSourceRecord } from './generic-import.js'
import { children, firstChild, parseXmlDocument, textOfChild } from './wordpress/xml.js'

/**
 * RSS 2.0 and Atom feed reading (fiche 25 task 5).
 *
 * Reuses the WXR reader's own XML parser rather than a new dependency (R9) —
 * both formats are well-known, narrow dialects `parseXmlDocument` already
 * reads safely (no DTD entity expansion, R8's own concern for content of
 * unknown provenance).
 */

function atomLink(item: import('./wordpress/xml.js').XmlElement): string {
  for (const link of children(item, 'link')) {
    if (link.attrs['rel'] === undefined || link.attrs['rel'] === 'alternate') {
      return link.attrs['href'] ?? ''
    }
  }
  return ''
}

/** `title`, `link`, `description`/`summary`/`content`, `pubDate`/`published`, `guid`/`id`. */
export function feedToRecords(xml: string): readonly GenericSourceRecord[] {
  const root = parseXmlDocument(xml)

  const isAtom = root.name === 'feed'
  const container = isAtom ? root : (firstChild(root, 'channel') ?? root)
  const itemName = isAtom ? 'entry' : 'item'
  const items = children(container, itemName)

  if (items.length === 0 && root.name !== 'rss' && !isAtom) {
    throw new CogentaError({
      code: 'IMPORT_FEED_INVALID',
      message: 'This document is neither an RSS <rss> feed nor an Atom <feed>.',
      hint: 'Point the importer at a real RSS 2.0 or Atom XML export.',
    })
  }

  return items.map((item, index) => {
    const title = textOfChild(item, 'title')
    const link = isAtom ? atomLink(item) : textOfChild(item, 'link')
    const description = isAtom
      ? textOfChild(item, 'summary') || textOfChild(item, 'content')
      : textOfChild(item, 'description')
    const published = isAtom
      ? textOfChild(item, 'published') || textOfChild(item, 'updated')
      : textOfChild(item, 'pubDate')
    const guid = isAtom ? textOfChild(item, 'id') : textOfChild(item, 'guid') || link

    const sourceId = guid.length > 0 ? guid : `${index + 1}`

    return {
      sourceId,
      values: { title, link, description, publishedAt: published },
    }
  })
}
