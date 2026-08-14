import type { ContentConversionNote } from './content-convert.js'

export interface UnconvertedItem {
  readonly type: string
  readonly wpId: string
  readonly title: string
  readonly reason: string
}

export interface ConversionReport {
  readonly imported: {
    readonly posts: number
    readonly pages: number
    readonly categories: number
    readonly tags: number
    readonly media: number
    readonly authors: number
    readonly comments: number
  }
  readonly redirectsCreated: number
  readonly skipped: readonly UnconvertedItem[]
  readonly unconvertedBlocks: readonly (ContentConversionNote & { readonly postTitle: string })[]
  readonly warnings: readonly string[]
}

export interface MutableConversionAccumulator {
  imported: {
    posts: number
    pages: number
    categories: number
    tags: number
    media: number
    authors: number
    comments: number
  }
  redirectsCreated: number
  skipped: UnconvertedItem[]
  unconvertedBlocks: (ContentConversionNote & { postTitle: string })[]
  warnings: string[]
}

export function emptyReport(): MutableConversionAccumulator {
  return {
    imported: { posts: 0, pages: 0, categories: 0, tags: 0, media: 0, authors: 0, comments: 0 },
    redirectsCreated: 0,
    skipped: [],
    unconvertedBlocks: [],
    warnings: [],
  }
}

/** A human-readable summary — what `cogenta import wordpress` prints. */
export function formatConversionReport(report: ConversionReport): string {
  const lines: string[] = []
  const { imported } = report

  lines.push('Imported:')
  lines.push(`  ${imported.posts} posts, ${imported.pages} pages`)
  lines.push(`  ${imported.categories} categories, ${imported.tags} tags`)
  lines.push(
    `  ${imported.media} media files, ${imported.authors} authors, ${imported.comments} comments`,
  )
  lines.push(`  ${report.redirectsCreated} redirects`)

  if (report.skipped.length > 0) {
    lines.push('')
    lines.push(`Not imported (${report.skipped.length}):`)
    for (const item of report.skipped) {
      lines.push(`  [${item.type} ${item.wpId}] "${item.title}" — ${item.reason}`)
    }
  }

  if (report.unconvertedBlocks.length > 0) {
    lines.push('')
    lines.push(
      `Content that could not be converted to a block or a rich-text node (${report.unconvertedBlocks.length}):`,
    )
    for (const note of report.unconvertedBlocks) {
      lines.push(`  "${note.postTitle}" — ${note.source}: ${note.reason}`)
    }
  }

  if (report.warnings.length > 0) {
    lines.push('')
    lines.push('Warnings:')
    for (const warning of report.warnings) lines.push(`  ${warning}`)
  }

  return lines.join('\n')
}
