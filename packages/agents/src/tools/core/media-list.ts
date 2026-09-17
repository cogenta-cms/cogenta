import type { MediaStore } from '@cogenta/core'
import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

/**
 * `media.list` — walking the media library, which `media.read` never could.
 *
 * Same relation as `content.list` to `content.read` (L22 task 3, added for
 * exactly the same reason: an agent that can only read by id ends up guessing
 * ids). It reuses the **existing** `media.read` permission rather than adding
 * one: listing is reading, and a site that granted an agent `media.read`
 * already accepted it seeing what the library holds.
 *
 * The shape is deliberately narrow — what a media audit actually needs (L5
 * task 10's Média agent: alt text, dimensions, weight), never the storage key
 * or anything an agent has no business rewriting.
 */

const InputSchema = z.object({
  kind: z.enum(['image', 'video', 'audio', 'file']).optional(),
  /** Page size. Capped: an unbounded list is how a library of ten thousand files becomes one prompt. */
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
})
type ListInput = z.infer<typeof InputSchema>

const ItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'video', 'audio', 'file']),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  alt: z.string(),
  decorative: z.boolean(),
  createdAt: z.string(),
})

const OutputSchema = z.object({
  items: z.array(ItemSchema),
  nextCursor: z.string().nullable(),
})
export type MediaListOutput = z.infer<typeof OutputSchema>

export function createMediaListTool(store: MediaStore): ToolDefinition<ListInput, MediaListOutput> {
  return defineTool({
    name: 'media.list',
    version: '1.0.0',
    description:
      'List media assets, newest first: id, filename, type, size, dimensions, alt text. Use it to find images with no alt text or files nothing uses.',
    input: InputSchema,
    output: OutputSchema,
    permissions: ['media.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input) {
      const page = await store.list({
        sort: 'createdAt',
        direction: 'desc',
        limit: input.limit ?? 50,
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      })
      return {
        items: page.items.map((asset) => ({
          id: asset.id,
          kind: asset.kind,
          filename: asset.filename,
          mimeType: asset.mimeType,
          size: asset.size,
          width: asset.width,
          height: asset.height,
          alt: asset.alt,
          decorative: asset.decorative,
          createdAt: asset.createdAt,
        })),
        nextCursor: page.nextCursor,
      }
    },
  })
}
