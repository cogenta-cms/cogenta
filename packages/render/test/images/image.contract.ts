import { CogentaError } from '@cogenta/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sniffImageFormat } from '../../src/images/format.js'
import { planTransform, type VariantRequest } from '../../src/images/geometry.js'
import { createImagePipeline } from '../../src/images/pipeline.js'
import type { ImageTransformer, RenderedVariant } from '../../src/images/types.js'
import {
  corruptPng,
  gifBytes,
  gradientPng,
  largePng,
  PALETTE,
  quadrantPng,
  transparentPng,
  truncatedPng,
} from './fixtures.js'
import { averageColour, decodePng, nearestName } from './png.js'

export interface ImageContractHarness {
  readonly transformer: ImageTransformer
  dispose?(): Promise<void>
}

/** WebAssembly libvips is several times slower than native; one budget for both. */
const SLOW = 60_000

/**
 * The single contract suite for `ImageTransformer`.
 *
 * Every implementation runs **this** file, never a copy adjusted to what that
 * tier happens to do. The L3 spec is unambiguous about why: the WASM fallback
 * has to be *tested* in CI, not merely present in the tree, because the tier
 * nobody exercises is the tier that is broken on the host that needs it.
 *
 * So the suite asserts behaviour a caller can rely on — sizes, formats, which
 * part of the picture survived a crop, which errors come back — and never the
 * bytes a particular codec produces. Two libvips builds do not agree
 * byte-for-byte, and a suite that demanded they did would have to be weakened
 * for one of them, which is how a contract stops being a contract.
 */
export function runImageContract(
  name: string,
  create: () => Promise<ImageContractHarness> | ImageContractHarness,
): void {
  describe(`ImageTransformer contract — ${name}`, () => {
    let harness: ImageContractHarness
    let transformer: ImageTransformer

    beforeAll(async () => {
      harness = await create()
      transformer = harness.transformer
    }, SLOW)

    afterAll(async () => {
      await harness.dispose?.()
    })

    /** Runs a request end to end, through the real shared geometry. */
    async function render(bytes: Uint8Array, request: VariantRequest): Promise<RenderedVariant> {
      const metadata = await transformer.metadata(bytes)
      return transformer.transform(bytes, planTransform(metadata, request))
    }

    describe('metadata', () => {
      it('reports the intrinsic size and format without being asked to resize', async () => {
        expect(await transformer.metadata(gradientPng(640, 480))).toEqual({
          width: 640,
          height: 480,
          format: 'png',
        })
      })

      it(
        'recognises every format it is expected to accept',
        async () => {
          const source = gradientPng(120, 90)
          for (const format of ['jpeg', 'webp', 'avif'] as const) {
            const encoded = await render(source, { format })
            expect((await transformer.metadata(encoded.bytes)).format).toBe(format)
          }
        },
        SLOW,
      )
    })

    describe('resizing', () => {
      it('produces the width it was asked for and keeps the aspect ratio', async () => {
        const variant = await render(gradientPng(800, 600), { width: 200 })

        expect(variant.width).toBe(200)
        expect(variant.height).toBe(150)
        expect(decodePng(variant.bytes)).toMatchObject({ width: 200, height: 150 })
      })

      it('derives the width when only a height is asked for', async () => {
        const variant = await render(gradientPng(800, 600), { height: 150 })

        expect(variant).toMatchObject({ width: 200, height: 150 })
      })

      it('refuses to upscale, returning the source size instead', async () => {
        // A variant larger than its source costs bytes and buys blur, and a
        // srcset that offers one makes the browser download it.
        const variant = await render(gradientPng(400, 300), { width: 1600 })

        expect(variant).toMatchObject({ width: 400, height: 300 })
      })

      it(
        'handles an image large enough to be processed in tiles',
        async () => {
          const variant = await render(largePng(), { width: 320 })

          expect(variant).toMatchObject({ width: 320, height: 213 })
          expect(decodePng(variant.bytes).width).toBe(320)
        },
        SLOW,
      )
    })

    describe('format conversion', () => {
      it(
        'writes each format it advertises, and says so in the content type',
        async () => {
          const source = gradientPng(160, 120)

          for (const format of ['png', 'jpeg', 'webp', 'avif'] as const) {
            const variant = await render(source, { width: 80, format })

            expect(variant.format).toBe(format)
            expect(sniffImageFormat(variant.bytes)).toBe(format)
            expect(variant.contentType).toBe(`image/${format}`)
            expect(variant).toMatchObject({ width: 80, height: 60 })
          }
        },
        SLOW,
      )

      it('keeps the source format when none is asked for', async () => {
        const variant = await render(gradientPng(200, 200), { width: 100 })

        expect(variant.format).toBe('png')
      })

      it(
        'flattens transparency onto white rather than onto black for JPEG',
        async () => {
          // JPEG has no alpha. Left to itself one tier drops the channel and the
          // other refuses the write, so the tiers only agree because the pipeline
          // decides. The transparent half must come back white, not black.
          const variant = await render(transparentPng(200, 200), { format: 'jpeg' })
          const asPng = await render(variant.bytes, { format: 'png' })
          const decoded = decodePng(asPng.bytes)

          const [r, g, b] = averageColour(decoded, { left: 150, top: 50, width: 40, height: 100 })
          expect(Math.min(r, g, b)).toBeGreaterThan(200)
        },
        SLOW,
      )

      it('re-encodes without resizing when only the format changes', async () => {
        const variant = await render(gradientPng(300, 200), { format: 'webp' })

        expect(variant).toMatchObject({ width: 300, height: 200, format: 'webp' })
      })
    })

    describe('focal point cropping', () => {
      /** The colour that dominates the top half of a crop of the quadrant image. */
      async function topHalfColour(request: VariantRequest): Promise<string> {
        const variant = await render(quadrantPng(400), { ...request, format: 'png' })
        const decoded = decodePng(variant.bytes)
        const measured = averageColour(decoded, {
          left: 0,
          top: 0,
          width: decoded.width,
          height: Math.floor(decoded.height / 2),
        })
        return nearestName(measured, PALETTE)
      }

      it(
        'keeps the part of the picture the focal point names',
        async () => {
          // A 100x200 box out of a square crops a vertical strip: which strip is
          // the only thing the focal point decides, and getting it wrong is how a
          // face ends up outside the frame.
          expect(await topHalfColour({ width: 100, height: 200, focal: { x: 0.9, y: 0.5 } })).toBe(
            'green',
          )
          expect(await topHalfColour({ width: 100, height: 200, focal: { x: 0.1, y: 0.5 } })).toBe(
            'red',
          )
        },
        SLOW,
      )

      it(
        'centres the crop when the media has no focal point',
        async () => {
          const variant = await render(quadrantPng(400), {
            width: 200,
            height: 400,
            format: 'png',
          })
          const decoded = decodePng(variant.bytes)

          // Dead centre of a centred vertical strip: red and green in equal parts.
          const left = averageColour(decoded, { left: 0, top: 0, width: 40, height: 40 })
          const right = averageColour(decoded, {
            left: decoded.width - 40,
            top: 0,
            width: 40,
            height: 40,
          })
          expect(nearestName(left, PALETTE)).toBe('red')
          expect(nearestName(right, PALETTE)).toBe('green')
        },
        SLOW,
      )

      it(
        'clamps a focal point at the very edge instead of cropping past it',
        async () => {
          const variant = await render(quadrantPng(400), {
            width: 200,
            height: 400,
            focal: { x: 0, y: 0 },
            format: 'png',
          })

          expect(variant).toMatchObject({ width: 200, height: 400 })
        },
        SLOW,
      )

      it('does not crop under a contain fit, whatever the focal point', async () => {
        const variant = await render(gradientPng(800, 600), {
          width: 200,
          height: 200,
          fit: 'contain',
          focal: { x: 0.9, y: 0.1 },
        })

        // The whole picture survives, letter-boxed by the caller if it wants to.
        expect(variant).toMatchObject({ width: 200, height: 150 })
      })
    })

    describe('refusals', () => {
      async function refusal(bytes: Uint8Array): Promise<CogentaError> {
        const error = await transformer
          .metadata(bytes)
          .then(() => null)
          .catch((thrown: unknown) => thrown)
        expect(error).toBeInstanceOf(CogentaError)
        return error as CogentaError
      }

      it('refuses a format it cannot resize, and names it', async () => {
        const error = await refusal(gifBytes())

        expect(error.code).toBe('CONTENT_INVALID')
        expect(error.message).toContain('GIF')
        expect(error.hint).toBeDefined()
      })

      it('refuses an empty file without crashing', async () => {
        expect((await refusal(new Uint8Array(0))).code).toBe('CONTENT_INVALID')
      })

      it('refuses a corrupted image rather than taking the process down', async () => {
        // The header says PNG and the rest is noise. A raw decoder failure here
        // is a WebAssembly exception on one tier and an Error on the other;
        // neither reaches the caller.
        const error = await refusal(corruptPng())

        expect(error.code).toBe('CONTENT_INVALID')
        expect(error).toBeInstanceOf(CogentaError)
      })

      it('never lets a raw codec failure escape for a truncated image', async () => {
        // libvips tolerates a truncated PNG by default and returns what it
        // managed to read, so the contract is not "this must fail" — it is "if
        // it fails, it fails as a CogentaError". A WebAssembly exception
        // reaching a request handler is the outcome being ruled out.
        const bytes = truncatedPng()
        const thrown = await transformer
          .metadata(bytes)
          .then((metadata) => transformer.transform(bytes, planTransform(metadata, { width: 50 })))
          .then(() => null)
          .catch((error: unknown) => error)

        expect(thrown === null || thrown instanceof CogentaError).toBe(true)
      })

      it('is still usable after a refusal', async () => {
        await refusal(gifBytes())

        expect(await render(gradientPng(100, 100), { width: 50 })).toMatchObject({ width: 50 })
      })
    })

    describe('lazy generation and caching', () => {
      it('generates nothing until a variant is actually requested', async () => {
        let reads = 0
        const pipeline = createImagePipeline({
          transformer,
          load: async () => {
            reads += 1
            return gradientPng(400, 300)
          },
        })

        const source = pipeline.source(
          { id: 'hero', kind: 'image', width: 400, height: 300 },
          { width: 200 },
        )

        expect(source.srcset).not.toBe('')
        expect(reads).toBe(0)
      })

      it('renders a variant once and serves it from the store afterwards', async () => {
        let reads = 0
        const pipeline = createImagePipeline({
          transformer,
          load: async () => {
            reads += 1
            return gradientPng(400, 300)
          },
        })

        const first = await pipeline.variant({ id: 'hero', width: 200 })
        const second = await pipeline.variant({ id: 'hero', width: 200 })

        expect(reads).toBe(1)
        expect(second.bytes).toBe(first.bytes)
        expect(first).toMatchObject({ width: 200, height: 150 })
      })

      it(
        'collapses simultaneous requests for the same variant into one render',
        async () => {
          // One hero image and twenty readers must cost one decode, not twenty.
          let reads = 0
          const pipeline = createImagePipeline({
            transformer,
            load: async () => {
              reads += 1
              return gradientPng(400, 300)
            },
          })

          const variants = await Promise.all(
            Array.from({ length: 8 }, () => pipeline.variant({ id: 'hero', width: 160 })),
          )

          expect(reads).toBe(1)
          expect(new Set(variants.map((variant) => variant.bytes)).size).toBe(1)
        },
        SLOW,
      )

      it('keeps variants of the same media apart', async () => {
        const pipeline = createImagePipeline({
          transformer,
          load: async () => gradientPng(400, 300),
        })

        const small = await pipeline.variant({ id: 'hero', width: 100 })
        const large = await pipeline.variant({ id: 'hero', width: 300 })

        expect(small.width).toBe(100)
        expect(large.width).toBe(300)
      })

      it('surfaces the refusal instead of caching a failure', async () => {
        const pipeline = createImagePipeline({ transformer, load: async () => gifBytes() })

        await expect(pipeline.variant({ id: 'animation', width: 100 })).rejects.toBeInstanceOf(
          CogentaError,
        )
        await expect(pipeline.variant({ id: 'animation', width: 100 })).rejects.toBeInstanceOf(
          CogentaError,
        )
      })
    })
  })
}
