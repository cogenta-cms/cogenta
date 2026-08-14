import { CogentaError } from '@cogenta/core'
import type {
  ParsedWxr,
  WxrAuthor,
  WxrCategory,
  WxrComment,
  WxrItem,
  WxrPostMeta,
  WxrTag,
  WxrTermRef,
} from './types.js'
import {
  children,
  firstChild,
  parseXmlDocument,
  textOf,
  textOfChild,
  type XmlElement,
} from './xml.js'

function parseAuthor(el: XmlElement): WxrAuthor {
  return {
    login: textOfChild(el, 'wp:author_login'),
    email: textOfChild(el, 'wp:author_email'),
    displayName: textOfChild(el, 'wp:author_display_name'),
  }
}

function parseCategoryTerm(el: XmlElement): WxrCategory {
  return {
    termId: textOfChild(el, 'wp:term_id'),
    niceName: textOfChild(el, 'wp:category_nicename'),
    name: textOfChild(el, 'wp:cat_name'),
  }
}

function parseTagTerm(el: XmlElement): WxrTag {
  return {
    termId: textOfChild(el, 'wp:term_id'),
    slug: textOfChild(el, 'wp:tag_slug'),
    name: textOfChild(el, 'wp:tag_name'),
  }
}

function parseTermRef(el: XmlElement): WxrTermRef {
  return {
    domain: el.attrs['domain'] ?? '',
    niceName: el.attrs['nicename'] ?? '',
    name: textOf(el),
  }
}

function parsePostMeta(el: XmlElement): WxrPostMeta {
  return { key: textOfChild(el, 'wp:meta_key'), value: textOfChild(el, 'wp:meta_value') }
}

function parseComment(el: XmlElement): WxrComment {
  return {
    id: textOfChild(el, 'wp:comment_id'),
    author: textOfChild(el, 'wp:comment_author'),
    authorEmail: textOfChild(el, 'wp:comment_author_email'),
    date: textOfChild(el, 'wp:comment_date_gmt') || textOfChild(el, 'wp:comment_date'),
    content: textOfChild(el, 'wp:comment_content'),
    approved: textOfChild(el, 'wp:comment_approved'),
    parentId: textOfChild(el, 'wp:comment_parent'),
  }
}

function parseItem(el: XmlElement): WxrItem {
  const postMeta = children(el, 'wp:postmeta').map(parsePostMeta)
  const thumbnailId = postMeta.find((meta) => meta.key === '_thumbnail_id')?.value ?? null

  return {
    postId: textOfChild(el, 'wp:post_id'),
    postType: textOfChild(el, 'wp:post_type'),
    title: textOfChild(el, 'title'),
    link: textOfChild(el, 'link'),
    postName: textOfChild(el, 'wp:post_name'),
    status: textOfChild(el, 'wp:status'),
    postDate: textOfChild(el, 'wp:post_date_gmt') || textOfChild(el, 'wp:post_date'),
    creator: textOfChild(el, 'dc:creator'),
    contentEncoded: textOfChild(el, 'content:encoded'),
    excerptEncoded: textOfChild(el, 'excerpt:encoded'),
    categories: children(el, 'category').map(parseTermRef),
    postMeta,
    comments: children(el, 'wp:comment').map(parseComment),
    attachmentUrl: textOfChild(el, 'wp:attachment_url') || null,
    thumbnailId,
  }
}

/**
 * Reads a WordPress "Export All Content" WXR file into plain data.
 *
 * No conversion decisions happen here — this module only decodes the XML into
 * the shape `content-convert.ts` and `import.ts` work from. `WXR_POST_STATUSES`
 * is not enforced here either: an export from a fork or a very old WordPress
 * version may carry a status this list does not name, and refusing to parse it
 * would lose everything else in the file over one field.
 */
export function parseWxr(source: string): ParsedWxr {
  const root = parseXmlDocument(source)
  const channel = firstChild(root, 'channel')
  if (channel === null) {
    throw new CogentaError({
      code: 'IMPORT_WXR_PARSE_FAILED',
      message: 'The document has no <channel> element.',
      hint: 'This does not look like a WordPress WXR export — check the file was produced by Tools → Export.',
    })
  }

  const items = children(channel, 'item').map(parseItem)

  return {
    siteTitle: textOfChild(channel, 'title'),
    baseUrl: textOfChild(channel, 'wp:base_site_url') || textOfChild(channel, 'wp:base_blog_url'),
    authors: children(channel, 'wp:author').map(parseAuthor),
    categories: children(channel, 'wp:category').map(parseCategoryTerm),
    tags: children(channel, 'wp:tag').map(parseTagTerm),
    items,
  }
}
