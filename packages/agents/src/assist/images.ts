import { z } from 'zod'
import { IMAGE_SIZES, type ImageProviderClient } from '../providers/image/types.js'
import { defineTool } from '../tools/define.js'
import type { ToolDefinition } from '../tools/types.js'

/**
 * L18 task 4 — `assist.generate_image`.
 *
 * The bytes are **returned, never stored**. Writing a generated image straight
 * into the media library would be a side effect on the site's content, which
 * this lot is not allowed to have without a human saying yes first (R6). So the
 * tool hands back a data URI, the admin panel shows it as a preview, and adding
 * it to the media library is the editor's own click through the ordinary
 * authenticated upload route — the same path a file from their disk takes,
 * with the same permission checks and the same audit entry.
 *
 * The trade-off that comes with that: a data URI is large, and a tool result
 * goes back into the model's context when this runs inside an agent loop. That
 * is why the tool is `cost: 'high'` and why no built-in agent lists it in its
 * manifest — its real home is the admin panel, one call at a time, with a
 * person looking at the result.
 */

const GenerateImageInput = z.object({
  prompt: z.string().min(3).max(2000),
  size: z.enum(IMAGE_SIZES).optional(),
  count: z.number().int().min(1).max(4).optional(),
})
type GenerateImageInput = z.infer<typeof GenerateImageInput>

const GeneratedImageSchema = z.object({
  /** `data:image/png;base64,…` — ready for an `<img src>`, and stored nowhere. */
  dataUrl: z.string().min(1),
  contentType: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  revisedPrompt: z.string().optional(),
})

const GenerateImageOutput = z.object({
  provider: z.string(),
  model: z.string(),
  images: z.array(GeneratedImageSchema).min(1),
  /** Always false: nothing was added to the media library, and nothing can be from here. */
  applied: z.literal(false),
})
export type GenerateImageResult = z.infer<typeof GenerateImageOutput>

/** Base64 length → decoded byte count, without decoding it. */
function byteLengthOf(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding)
}

export function createGenerateImageTool(
  client: ImageProviderClient,
): ToolDefinition<GenerateImageInput, GenerateImageResult> {
  return defineTool({
    name: 'assist.generate_image',
    version: '1.0.0',
    description: 'Generate candidate images from a description. Stores nothing.',
    input: GenerateImageInput,
    output: GenerateImageOutput,
    permissions: ['media.suggest'],
    sideEffects: false,
    reversible: false,
    cost: 'high',
    // Image generation is the most expensive thing in this lot by an order of
    // magnitude, and the one an accidental loop would bill hardest for.
    rateLimit: { perHour: 30 },
    async execute(input, ctx) {
      const generated = await client.generate(
        {
          prompt: input.prompt,
          ...(input.size === undefined ? {} : { size: input.size }),
          ...(input.count === undefined ? {} : { count: input.count }),
        },
        { signal: ctx.signal },
      )

      return {
        provider: client.name,
        model: client.model,
        images: generated.map((image) => ({
          dataUrl: `data:${image.contentType};base64,${image.base64}`,
          contentType: image.contentType,
          byteLength: byteLengthOf(image.base64),
          ...(image.revisedPrompt === undefined ? {} : { revisedPrompt: image.revisedPrompt }),
        })),
        applied: false,
      }
    },
  })
}
