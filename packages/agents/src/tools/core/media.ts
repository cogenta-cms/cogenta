import type { MediaAsset, MediaStore, UpdateMediaInput } from '@cogenta/core'
import { CogentaError } from '@cogenta/core'
import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

const FocalPointSchema = z.object({ x: z.number(), y: z.number() })

/**
 * `media.read`/`media.write`'s output shape — deliberately **not** the same
 * type as `@cogenta/core`'s `MediaAsset` any more.
 *
 * Fiche 46 added `folderId` to `MediaAsset` (the media library's folder
 * tree). Contract C (`docs/04-contrats.md`, ADR-0020) treats an existing
 * tool's signature as figured: growing it — even by an additive field —
 * needs a governance decision this session cannot make unilaterally (unlike
 * contract A or D, contract C's own text carries no "additive is minor"
 * exception for an already-shipped tool). Rather than touch it, `folderId`
 * is stripped before this shape is built at all, so `media.read`/`.write`'s
 * wire output is byte-for-byte what it was before this fiche — an agent
 * asking to move a file between folders needs a new, separate tool, not
 * this one grown quietly.
 */
type MediaToolAsset = Omit<MediaAsset, 'folderId'>

function toToolAsset(asset: MediaAsset): MediaToolAsset {
  const { folderId: _folderId, ...rest } = asset
  return rest
}

const MediaAssetSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'video', 'audio', 'file']),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  alt: z.string(),
  decorative: z.boolean(),
  decorativeJustification: z.string().nullable(),
  focal: FocalPointSchema.nullable(),
  storageKey: z.string(),
  tags: z.array(z.string()),
  contentHash: z.string(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
}) satisfies z.ZodType<MediaToolAsset>

const ReadInputSchema = z.object({ id: z.string() })
type ReadInput = z.infer<typeof ReadInputSchema>

/**
 * `media.read` — `MediaStore` (`@cogenta/core`) has no permission layer of
 * its own yet (`media-router.ts`'s own comment names this a known gap,
 * closed here rather than there): this tool's declared `permissions` is the
 * actual gate, enforced by the manifest before the call ever reaches the
 * store.
 */
export function createMediaReadTool(store: MediaStore): ToolDefinition<ReadInput, MediaToolAsset> {
  return defineTool({
    name: 'media.read',
    version: '1.0.0',
    description: 'Read one media asset by id.',
    input: ReadInputSchema,
    output: MediaAssetSchema,
    permissions: ['media.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input) {
      const asset = await store.get(input.id)
      if (asset === null) {
        throw new CogentaError({
          code: 'MEDIA_NOT_FOUND',
          message: `No media asset with id "${input.id}".`,
          hint: 'Check the id, or list media to find the right one.',
        })
      }
      return toToolAsset(asset)
    },
  })
}

const WriteInputSchema = z.object({
  id: z.string(),
  alt: z.string().optional(),
  decorative: z.boolean().optional(),
  decorativeJustification: z.string().nullable().optional(),
  focal: FocalPointSchema.nullable().optional(),
})
type WriteInput = z.infer<typeof WriteInputSchema>

/**
 * `media.write` — metadata only (alt text, decorative flag/justification,
 * focal point). Uploading a new asset needs binary transfer this
 * text/JSON tool-calling protocol was never designed to carry, and is a
 * genuinely different, heavier operation (type sniffing, re-encoding,
 * variant generation — `L2-admin.md`'s own media pipeline) than an agent
 * editing an existing asset's accessibility metadata, which is the concrete
 * use case this tool exists for (e.g. an accessibility-review agent).
 */
export function createMediaWriteTool(
  store: MediaStore,
): ToolDefinition<WriteInput, MediaToolAsset> {
  return defineTool({
    name: 'media.write',
    version: '1.0.0',
    description: "Update a media asset's alt text, decorative flag, or focal point.",
    input: WriteInputSchema,
    output: MediaAssetSchema,
    permissions: ['media.write'],
    sideEffects: true,
    reversible: false,
    cost: 'low',
    async execute(input) {
      const update: UpdateMediaInput = {
        ...(input.alt === undefined ? {} : { alt: input.alt }),
        ...(input.decorative === undefined ? {} : { decorative: input.decorative }),
        ...(input.decorativeJustification === undefined
          ? {}
          : { decorativeJustification: input.decorativeJustification }),
        ...(input.focal === undefined ? {} : { focal: input.focal }),
      }
      return toToolAsset(await store.update(input.id, update))
    },
  })
}
