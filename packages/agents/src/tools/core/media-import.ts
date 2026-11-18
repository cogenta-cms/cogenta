import { CogentaError } from '@cogenta/core'
import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

/**
 * `media.import_url` — copies one image from a public `https:` address into
 * the site's media library, so an entry can use it as its cover.
 *
 * Before this tool, an MCP client that found the right photograph (a
 * Wikimedia Commons file, a press kit) had no way to put it in the library:
 * `media.write` edits metadata only and `media.store_generated_image` takes a
 * generated data URL, never an address. A publishing client had to fall back
 * to the REST upload route beside MCP.
 *
 * The fetch itself is not this module's business. It is injected, because
 * the host owns the two things that make it safe: the outbound guard (every
 * hop resolved and pinned to a public address, redirects judged one by one,
 * a size cap and a deadline) and the media ingest every human upload goes
 * through (the real type sniffed from the bytes, GPS stripped, renditions
 * written). This tool only shapes the call and refuses what is plainly not
 * an `https:` address before anything leaves the server.
 *
 * `sideEffects: true`, `reversible: false`: a human approves every file that
 * lands in the library, the same rule as `media.store_generated_image`.
 */
export interface MediaImportUrlToolOptions {
  readonly importImage: (input: {
    readonly url: string
    readonly alt: string
    readonly filename?: string
    readonly credit?: MediaImportCredit
  }) => Promise<MediaImportResult>
}

export interface MediaImportCredit {
  readonly author?: string
  readonly license?: string
  readonly sourcePage?: string
}

export interface MediaImportResult {
  readonly id: string
  readonly filename: string
  readonly mimeType: string
  readonly byteLength: number
  readonly width: number | null
  readonly height: number | null
}

const CreditSchema = z.object({
  author: z.string().min(1).max(300).optional(),
  license: z.string().min(1).max(100).optional(),
  sourcePage: z.string().url().max(2000).optional(),
})

const ImportUrlInputSchema = z.object({
  /** A public `https:` address of the image file itself (not of a page showing it). */
  url: z.string().url().max(2000),
  /** What a screen reader should say. Required, as for every image in the library. */
  alt: z.string().min(1).max(1000),
  /** Without an extension — the ingest derives one from the bytes' real type. */
  filename: z.string().min(1).max(200).optional(),
  /** Who made the image and under which licence, kept with the file. */
  credit: CreditSchema.optional(),
})
export type MediaImportUrlInput = z.infer<typeof ImportUrlInputSchema>

const ImportUrlOutputSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  byteLength: z.number().int().nonnegative(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  sourceUrl: z.string(),
})
export type MediaImportUrlOutput = z.infer<typeof ImportUrlOutputSchema>

export function createMediaImportUrlTool(
  options: MediaImportUrlToolOptions,
): ToolDefinition<MediaImportUrlInput, MediaImportUrlOutput> {
  return defineTool({
    name: 'media.import_url',
    version: '1.0.0',
    description:
      'Copy one image from a public https address into the media library and return its id, to use as an entry cover or in content. `url` must point at the image file itself (JPEG, PNG, WebP, GIF or AVIF), not at a web page. Give the alt text a screen reader should read, and the author and licence when the image is not yours (for example a Wikimedia Commons file).',
    input: ImportUrlInputSchema,
    output: ImportUrlOutputSchema,
    permissions: ['media.write'],
    sideEffects: true,
    reversible: false,
    cost: 'low',
    rateLimit: { perHour: 30 },
    async execute(input) {
      const parsed = new URL(input.url)
      if (parsed.protocol !== 'https:') {
        throw new CogentaError({
          code: 'MEDIA_INVALID',
          message: `Only an https address can be imported, not "${parsed.protocol}".`,
          hint: 'Use the https address of the image file.',
        })
      }
      const imported = await options.importImage({
        url: parsed.href,
        alt: input.alt,
        ...(input.filename === undefined ? {} : { filename: input.filename }),
        ...(input.credit === undefined ? {} : { credit: creditOf(input.credit) }),
      })
      return { ...imported, sourceUrl: parsed.href }
    },
  })
}

function creditOf(input: NonNullable<MediaImportUrlInput['credit']>): MediaImportCredit {
  return {
    ...(input.author === undefined ? {} : { author: input.author }),
    ...(input.license === undefined ? {} : { license: input.license }),
    ...(input.sourcePage === undefined ? {} : { sourcePage: input.sourcePage }),
  }
}
