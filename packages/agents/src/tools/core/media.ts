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
 *
 * `provenance`/`provenanceDetail` are stripped for exactly the same reason,
 * and it was nearly missed: they were added to `MediaAsset` (so that a
 * generated image is never mistaken for a photograph someone took), which
 * would have widened this already-shipped tool's output as a side effect. An
 * agent that needs to know what made a file needs a tool that says so in its
 * own signature — `media.store_generated_image` below reports it for what it
 * writes — not `media.read` grown quietly.
 */
type MediaToolAsset = Omit<MediaAsset, 'folderId' | 'provenance' | 'provenanceDetail'>

function toToolAsset(asset: MediaAsset): MediaToolAsset {
  const {
    folderId: _folderId,
    provenance: _provenance,
    provenanceDetail: _provenanceDetail,
    ...rest
  } = asset
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

/**
 * `media.store_generated_image` — the step that turns a generated candidate
 * into a real file in the library.
 *
 * `assist.generate_image` deliberately stores nothing: it returns data URLs
 * and says `applied: false`, because generating is cheap to undo and storing
 * is not. Nothing bridged the two, so an image a model produced could be
 * looked at and never kept. This is that bridge, and it is deliberately the
 * *only* one: every file it writes is recorded as `generated`, with the
 * agent and model that made it, because the alternative — a picture nobody
 * can tell apart from a photograph the owner took — is the claim contract A
 * made provenance non-optional to prevent.
 *
 * `sideEffects: true` with `reversible: false` puts it through
 * `withAutonomy`'s forced-approval path whatever the configured level
 * (`autonomy/with-autonomy.ts`): a human confirms every file that lands in
 * the library. That is the design, not a limitation to route around.
 *
 * `alt` is required rather than optional for the same reason the media store
 * refuses an empty one on a non-decorative asset: a model that just described
 * an image well enough to generate it can describe it well enough to be read
 * aloud.
 */
export interface MediaStoreImageToolOptions {
  /**
   * Writes the bytes through the host's storage driver and creates the media
   * row. Injected rather than taken as a `MediaStore`, because storing a file
   * needs a `StorageDriver` too and this package has no business choosing
   * where bytes live.
   */
  readonly save: (input: {
    readonly dataUrl: string
    readonly filename: string
    readonly alt: string
    readonly provenanceDetail: Readonly<Record<string, unknown>>
  }) => Promise<{ readonly id: string; readonly filename: string; readonly byteLength: number }>
  /** Named in the provenance of everything this writes. */
  readonly agentName: string
  readonly model?: string
  readonly now?: () => Date
}

const StoreImageInputSchema = z.object({
  /** Exactly the `dataUrl` `assist.generate_image` returned — never a URL to fetch. */
  dataUrl: z.string().min(1),
  /** What a screen reader should say. Required: an image nobody can describe is an image nobody should publish. */
  alt: z.string().min(1).max(1000),
  /** Without an extension — the store derives one from the bytes' real type. */
  filename: z.string().min(1).max(200).optional(),
})
export type StoreImageInput = z.infer<typeof StoreImageInputSchema>

const StoreImageOutputSchema = z.object({
  id: z.string(),
  filename: z.string(),
  byteLength: z.number().int().nonnegative(),
  /** Always `generated` — this tool has no other honest answer, and says so in its own signature rather than leaving a caller to assume. */
  provenance: z.literal('generated'),
})
export type StoreImageOutput = z.infer<typeof StoreImageOutputSchema>

export function createMediaStoreImageTool(
  options: MediaStoreImageToolOptions,
): ToolDefinition<StoreImageInput, StoreImageOutput> {
  const now = options.now ?? (() => new Date())
  return defineTool({
    name: 'media.store_generated_image',
    version: '1.0.0',
    description: `Keeps one generated image in the site's media library, so a page or a theme can point at it. Pass the dataUrl exactly as assist.generate_image returned it, plus the alt text a screen reader should read.

The file is recorded as generated, naming the agent and model that made it — a visitor's country may require that, and a reader deserves it either way. Generating costs money and storing costs a decision, which is why they are two steps: generate several, look at them, keep the one that is right.`,
    input: StoreImageInputSchema,
    output: StoreImageOutputSchema,
    permissions: ['media.write'],
    sideEffects: true,
    reversible: false,
    cost: 'low',
    async execute(input) {
      if (!input.dataUrl.startsWith('data:image/')) {
        throw new CogentaError({
          code: 'MEDIA_INVALID',
          message: 'Only an inline image data URL can be stored by this tool.',
          hint: 'Pass the `dataUrl` from assist.generate_image verbatim — this tool never fetches a remote URL.',
        })
      }
      const saved = await options.save({
        dataUrl: input.dataUrl,
        filename: input.filename ?? 'generated-image',
        alt: input.alt,
        provenanceDetail: {
          agent: options.agentName,
          ...(options.model === undefined ? {} : { model: options.model }),
          at: now().toISOString(),
        },
      })
      return {
        id: saved.id,
        filename: saved.filename,
        byteLength: saved.byteLength,
        provenance: 'generated',
      }
    },
  })
}
