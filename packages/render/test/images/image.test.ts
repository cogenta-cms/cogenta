import { CogentaError, createLogger } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { focalCrop, MAX_DIMENSION, planTransform } from '../../src/images/geometry.js'
import { createImageRegistry } from '../../src/images/index.js'
import { parseVariantParameters, variantKey } from '../../src/images/pipeline.js'
import { createSharpTransformer, loadSharpModule } from '../../src/images/sharp.js'
import { candidateWidths, describeMedia } from '../../src/images/srcset.js'
import { createMemoryVariantStore } from '../../src/images/store.js'
import type { ImageMetadata, RenderedVariant } from '../../src/images/types.js'
import { createWasmTransformer, loadVips } from '../../src/images/wasm.js'
import { runImageContract } from './image.contract.js'

const silent = createLogger({ level: 'silent' })

/**
 * The degraded tier runs the contract **unconditionally**.
 *
 * Not `skipIf(sharp)`, not "when Redis is absent", not behind an environment
 * variable: the L3 spec asks for the WASM fallback to be tested in CI rather
 * than merely present, and a suite that quietly stops running it on the
 * maintainer's laptop — the one machine where sharp always installs — is exactly
 * the hole it is warning about.
 */
runImageContract('wasm (WebAssembly libvips)', async () => ({
  transformer: createWasmTransformer(await loadVips()),
}))

// The optimal tier runs the same file when it is installed. It is a devDependency
// of this package, so CI exercises both on every platform where sharp has a
// prebuilt binary — and skips only where it genuinely cannot be installed, which
// is the situation the degraded tier exists for.
const sharp = await loadSharpModule()

if (sharp === null) {
  describe('ImageTransformer contract — sharp (native libvips)', () => {
    it.skip('sharp is not installed on this machine, so the optimal tier is not exercised', () => {})
  })
} else {
  runImageContract('sharp (native libvips)', () => ({
    transformer: createSharpTransformer(sharp),
  }))
}

describe('image driver registry', () => {
  it('offers a driver that needs nothing installed, whatever the host', async () => {
    const registry = createImageRegistry({ logger: silent })

    expect(registry.list().map((driver) => driver.name)).toEqual(['sharp', 'wasm'])
    expect(registry.list().map((driver) => driver.tier)).toEqual(['optimal', 'degraded'])
  })

  it('prefers sharp when it is installed and falls through to WebAssembly when it is not', async () => {
    const selection = await createImageRegistry({ logger: silent }).select({})

    expect(selection.driver).toBe(sharp === null ? 'wasm' : 'sharp')
    await selection.dispose()
  })

  it('honours an explicitly named degraded driver', async () => {
    const selection = await createImageRegistry({ logger: silent }).select({ driver: 'wasm' })

    expect(selection).toMatchObject({ driver: 'wasm', tier: 'degraded', requested: true })
    expect(await selection.health()).toMatchObject({
      tier: 'degraded',
      message: expect.stringContaining('WebAssembly'),
    })
    await selection.dispose()
  })

  it('refuses a driver nobody registered rather than silently choosing one', async () => {
    await expect(
      createImageRegistry({ logger: silent }).select({ driver: 'imagemagick' }),
    ).rejects.toMatchObject({ code: 'DRIVER_UNKNOWN' })
  })
})

describe('transform planning', () => {
  const source: ImageMetadata = { width: 1000, height: 500, format: 'jpeg' }

  it('asks for no work at all when nothing was requested', () => {
    expect(planTransform(source, {})).toMatchObject({ crop: null, resize: null, format: 'jpeg' })
  })

  it('keeps the source format unless another is asked for', () => {
    expect(planTransform(source, { format: 'avif' }).format).toBe('avif')
  })

  it('crops to the requested ratio before resizing, under a cover fit', () => {
    const plan = planTransform(source, { width: 200, height: 200 })

    // 1000×500 to a square, with no focal point: the middle 500 pixels.
    expect(plan.crop).toEqual({ left: 250, top: 0, width: 500, height: 500 })
    expect(plan.resize).toEqual({ width: 200, height: 200 })
  })

  it('keeps the focal point in frame rather than centring on it', () => {
    // A face at 90% across. Centring the crop on it would push the window off
    // the right edge, so it is clamped to the edge and the face stays visible.
    const plan = planTransform(source, { width: 200, height: 200, focal: { x: 0.9, y: 0.5 } })

    expect(plan.crop).toEqual({ left: 500, top: 0, width: 500, height: 500 })
  })

  it('moves the window towards the focal point when there is room', () => {
    const plan = planTransform(source, { width: 200, height: 200, focal: { x: 0.6, y: 0.5 } })

    expect(plan.crop).toEqual({ left: 350, top: 0, width: 500, height: 500 })
  })

  it('never crops under a contain fit', () => {
    const plan = planTransform(source, { width: 200, height: 200, fit: 'contain' })

    expect(plan.crop).toBeNull()
    expect(plan.resize).toEqual({ width: 200, height: 100 })
  })

  it('refuses a width that is not a whole number of pixels', () => {
    expect(() => planTransform(source, { width: 0 })).toThrow(CogentaError)
    expect(() => planTransform(source, { width: -10 })).toThrow(CogentaError)
    expect(() => planTransform(source, { width: 12.5 })).toThrow(CogentaError)
  })

  it('refuses a width above the ceiling, because /_image is a public URL', () => {
    // Without a ceiling, one request for a 40000px variant is an out-of-memory
    // and a loop over widths is a cache-filling attack.
    expect(() => planTransform(source, { width: MAX_DIMENSION + 1 })).toThrow(/above the 8192px/u)
  })

  it('refuses a focal point that is not expressed in fractions', () => {
    expect(() =>
      planTransform(source, { width: 10, height: 10, focal: { x: 400, y: 300 } }),
    ).toThrow(CogentaError)
  })

  it('refuses an encoder quality outside 1..100', () => {
    expect(() => planTransform(source, { quality: 0 })).toThrow(CogentaError)
    expect(() => planTransform(source, { quality: 101 })).toThrow(CogentaError)
  })
})

describe('focal crop geometry', () => {
  const source = { width: 1000, height: 1000 }

  it('centres on the focal point when there is room', () => {
    expect(focalCrop(source, { width: 100, height: 200 }, { x: 0.5, y: 0.5 })).toEqual({
      left: 250,
      top: 0,
      width: 500,
      height: 1000,
    })
  })

  it('slides the crop back inside the image instead of running off the edge', () => {
    // A face near the right edge must stay in frame; a naive "centre on the
    // focal point" produces a negative left and a crop that is half nothing.
    expect(focalCrop(source, { width: 100, height: 200 }, { x: 0.95, y: 0.5 }).left).toBe(500)
    expect(focalCrop(source, { width: 100, height: 200 }, { x: 0.02, y: 0.5 }).left).toBe(0)
  })

  it('falls back to the middle when the media has no focal point', () => {
    expect(focalCrop(source, { width: 200, height: 100 }, null)).toEqual({
      left: 0,
      top: 250,
      width: 1000,
      height: 500,
    })
  })
})

describe('ctx.image() — what a theme gets back', () => {
  const photo = {
    id: 'photo-1',
    kind: 'image',
    alt: 'A lighthouse',
    width: 1600,
    height: 900,
    focal: { x: 0.3, y: 0.2 },
  } as const

  it('describes an image without generating anything', () => {
    const source = describeMedia(photo, { width: 800 })

    expect(source.kind).toBe('image')
    expect(source.src).toBe('/_image?id=photo-1&w=800')
    expect(source.width).toBe(800)
    expect(source.height).toBe(450)
    expect(source.alt).toBe('A lighthouse')
    expect(source.focal).toEqual({ x: 0.3, y: 0.2 })
  })

  it('offers a srcset capped at the intrinsic width, so nothing is upscaled', () => {
    const source = describeMedia(photo, { width: 800 })
    const widths = source.srcset.split(', ').map((entry) => entry.split(' ')[1])

    expect(widths).toEqual(['320w', '640w', '800w', '960w', '1280w'])
  })

  it('carries the format and fit into every candidate URL', () => {
    const source = describeMedia(photo, { width: 640, format: 'avif', fit: 'cover' })

    expect(source.src).toContain('f=avif')
    expect(source.srcset).toContain('fit=cover')
  })

  it('never puts the focal point in the URL', () => {
    // The endpoint reads it from the media entity. In the URL, a visitor could
    // choose the crop, and every image would have as many cache keys as there
    // are points someone cares to try.
    expect(describeMedia(photo, { width: 640 }).srcset).not.toContain('focal')
  })

  it('returns a video as a video, with no srcset and its poster', () => {
    const source = describeMedia(
      {
        id: 'clip-9',
        kind: 'video',
        width: 1920,
        height: 1080,
        alt: 'The workshop',
        poster: '/media/clip-9.jpg',
      },
      {},
    )

    expect(source.kind).toBe('video')
    expect(source.srcset).toBe('')
    expect(source.src).toBe('/_media/clip-9')
    expect(source.poster).toBe('/media/clip-9.jpg')
    expect(source).toMatchObject({ width: 1920, height: 1080 })
  })

  it('omits the poster rather than inventing one', () => {
    const source = describeMedia({ id: 'clip-9', kind: 'video', width: 640, height: 360 })

    expect(source.poster).toBeUndefined()
    expect(source.kind).toBe('video')
  })

  it('refuses a media with no size rather than shipping a layout shift', () => {
    expect(() => describeMedia({ id: 'unscanned', kind: 'image' })).toThrow(CogentaError)
  })

  it('caps the ladder at the intrinsic width and always includes the asked-for one', () => {
    expect(candidateWidths(700, 1000)).toEqual([320, 640, 700, 960])
    expect(candidateWidths(2000, 500)).toEqual([320, 500])
  })

  // Fiche 05 task 2: `MediaAsset.version` existed on the type since
  // `theme@1.2` but `variantUrl` never read it — a replaced original kept
  // serving under the exact query string a year-long `immutable` cache had
  // already stored.
  it('folds a present version into every candidate URL, breaking the cache after a replace', () => {
    const versioned = { ...photo, version: 'abc123' }
    const source = describeMedia(versioned, { width: 800 })

    expect(source.src).toBe('/_image?id=photo-1&w=800&v=abc123')
    for (const entry of source.srcset.split(', ')) expect(entry).toContain('v=abc123')
  })

  it('omits `v=` entirely when no version is known, unchanged from before this field was wired up', () => {
    const source = describeMedia(photo, { width: 800 })
    expect(source.src).not.toContain('v=')
  })
})

describe('/_image query parsing', () => {
  it('reads the parameters a variant URL carries', () => {
    const parsed = parseVariantParameters(
      new URLSearchParams('id=photo-1&w=640&h=480&f=webp&fit=contain'),
    )

    expect(parsed).toEqual({
      id: 'photo-1',
      width: 640,
      height: 480,
      format: 'webp',
      fit: 'contain',
    })
  })

  it('refuses a request that names no media', () => {
    expect(() => parseVariantParameters(new URLSearchParams('w=100'))).toThrow(CogentaError)
  })

  it('refuses a format Cogenta cannot produce', () => {
    expect(() => parseVariantParameters(new URLSearchParams('id=a&f=tiff'))).toThrow(
      /not a format/u,
    )
  })

  it('refuses a fit that is neither cover nor contain', () => {
    expect(() => parseVariantParameters(new URLSearchParams('id=a&fit=squish'))).toThrow(
      CogentaError,
    )
  })

  it('refuses a width that is not a whole number', () => {
    expect(() => parseVariantParameters(new URLSearchParams('id=a&w=1e9x'))).toThrow(CogentaError)
    expect(() => parseVariantParameters(new URLSearchParams('id=a&w='))).toThrow(CogentaError)
  })

  it('gives two different requests two different cache keys', () => {
    const key = (query: string): string =>
      variantKey(parseVariantParameters(new URLSearchParams(query)), 80)

    expect(key('id=a&w=100')).not.toBe(key('id=a&w=200'))
    expect(key('id=a&w=100&f=webp')).not.toBe(key('id=a&w=100&f=avif'))
    expect(key('id=a&w=100')).toBe(key('id=a&w=100'))
  })

  it('separates two crops of the same media', () => {
    const base = { id: 'a', width: 100 } as const

    expect(variantKey(base, 80)).not.toBe(variantKey({ ...base, focal: { x: 0.9, y: 0.1 } }, 80))
  })
})

describe('variant store', () => {
  const variant = (size: number): RenderedVariant => ({
    bytes: new Uint8Array(size),
    width: 10,
    height: 10,
    format: 'png',
    contentType: 'image/png',
  })

  it('returns what it was given', async () => {
    const store = createMemoryVariantStore()
    await store.set('k', variant(10))

    expect((await store.get('k'))?.bytes.byteLength).toBe(10)
    expect(await store.get('missing')).toBeNull()
  })

  it('drops the least recently used variant when the budget is spent', async () => {
    // Bounded by bytes, not by entry count: a thousand thumbnails and a
    // thousand hero images are the same number of entries and two orders of
    // magnitude apart in memory.
    const store = createMemoryVariantStore({ maxBytes: 250 })
    await store.set('a', variant(100))
    await store.set('b', variant(100))
    await store.get('a') // 'a' is now the most recent
    await store.set('c', variant(100))

    expect(await store.get('b')).toBeNull()
    expect(await store.get('a')).not.toBeNull()
    expect(await store.get('c')).not.toBeNull()
  })

  it('serves a variant larger than the whole budget without keeping it', async () => {
    const store = createMemoryVariantStore({ maxBytes: 50 })
    await store.set('huge', variant(500))
    await store.set('small', variant(10))

    expect(await store.get('huge')).toBeNull()
    expect(await store.get('small')).not.toBeNull()
  })

  it('forgets everything on clear and stays usable', async () => {
    const store = createMemoryVariantStore()
    await store.set('a', variant(10))
    await store.clear()
    await store.set('b', variant(10))

    expect(await store.get('a')).toBeNull()
    expect(await store.get('b')).not.toBeNull()
  })
})
