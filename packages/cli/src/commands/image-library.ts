import { randomUUID } from 'node:crypto'
import {
  createImageProviderRegistry,
  type ImageProviderClient,
  type ProviderConfigStore,
  resolveImageProviderRegistryConfig,
} from '@cogenta/agents'
import { CogentaError, type MediaStore, type StorageDriver } from '@cogenta/core'

/**
 * Where a generated image actually lands.
 *
 * `assist.generate_image` returns data URLs and stores nothing, on purpose —
 * generating is cheap to undo and storing is not. This is the host side of
 * the one tool that bridges the two (`media.store_generated_image`,
 * `@cogenta/agents`), and it lives here because storing a file needs both a
 * `StorageDriver` and a `MediaStore`, neither of which that package has any
 * business choosing.
 *
 * Everything written through here is recorded as `generated`, with the agent
 * and the model that made it. That is the whole reason this path is separate
 * from an ordinary upload: a picture nobody can tell apart from a photograph
 * the owner took is the claim contract A made provenance non-optional to
 * prevent.
 */

/** Mirrors the sizes `MediaKind` recognises for an image, keyed by what a data URL can actually announce. */
const EXTENSION_BY_TYPE: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export interface ImageLibraryOptions {
  readonly mediaStore: MediaStore
  readonly storage: StorageDriver
  /** Recorded as the actor who created the row — an agent run has no signed-in human of its own. */
  readonly createdBy?: string | null
}

export interface StoreGeneratedImageInput {
  readonly dataUrl: string
  readonly filename: string
  readonly alt: string
  readonly provenanceDetail: Readonly<Record<string, unknown>>
}

export interface StoredGeneratedImage {
  readonly id: string
  readonly filename: string
  readonly byteLength: number
}

/**
 * Splits `data:image/png;base64,…` into a real content type and real bytes.
 *
 * Refuses anything that is not an inline image: this path exists to keep what
 * a model just produced, never to fetch a URL somebody handed it — which
 * would be a server-side request with an agent's prompt choosing the target.
 */
function decodeImageDataUrl(dataUrl: string): { contentType: string; bytes: Buffer } {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/iu.exec(dataUrl)
  if (match === null) {
    throw new CogentaError({
      code: 'MEDIA_INVALID',
      message: 'That is not a base64 inline image data URL.',
      hint: 'Pass the `dataUrl` from assist.generate_image verbatim — a remote URL is never fetched here.',
    })
  }
  const contentType = (match[1] as string).toLowerCase()
  if (EXTENSION_BY_TYPE[contentType] === undefined) {
    throw new CogentaError({
      code: 'MEDIA_INVALID',
      message: `This site does not store "${contentType}" images.`,
      hint: `Ask for one of: ${Object.keys(EXTENSION_BY_TYPE).join(', ')}.`,
      details: { contentType },
    })
  }
  const bytes = Buffer.from(match[2] as string, 'base64')
  if (bytes.byteLength === 0) {
    throw new CogentaError({
      code: 'MEDIA_INVALID',
      message: 'The image data URL decoded to nothing.',
      hint: 'The generation probably failed — try again rather than storing an empty file.',
    })
  }
  return { contentType, bytes }
}

/** Keeps the operator's name, drops everything a file path could not survive. */
function safeStem(filename: string): string {
  const stem = filename
    .replace(/\.[a-z0-9]+$/iu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60)
  return stem === '' ? 'generated-image' : stem
}

export function createImageLibrary(
  options: ImageLibraryOptions,
): (input: StoreGeneratedImageInput) => Promise<StoredGeneratedImage> {
  return async (input) => {
    const { contentType, bytes } = decodeImageDataUrl(input.dataUrl)
    const extension = EXTENSION_BY_TYPE[contentType] as string
    const filename = `${safeStem(input.filename)}.${extension}`
    // The id is minted here so the storage key and the row agree, and so two
    // images generated from the same prompt never collide on a key.
    const id = randomUUID()
    const storageKey = `media/${id}.${extension}`

    await options.storage.put(storageKey, bytes, { contentType })

    const asset = await options.mediaStore.create({
      id,
      kind: 'image',
      filename,
      mimeType: contentType,
      size: bytes.byteLength,
      alt: input.alt,
      storageKey,
      provenance: 'generated',
      provenanceDetail: input.provenanceDetail,
      ...(options.createdBy === undefined ? {} : { createdBy: options.createdBy }),
    })

    return { id: asset.id, filename: asset.filename, byteLength: asset.size }
  }
}

/**
 * The image client this site can actually use right now.
 *
 * Two sources, in this order, and the order is the point: the admin's own
 * provider store first — where an operator sets an image model from the
 * Providers screen and expects the next request to honour it — then the
 * static `imageGeneration` section of `cogenta.config.mjs`, which is what
 * sites had before the store could carry an image model at all.
 *
 * Read fresh on every call, never cached: a key saved from the admin has to
 * work on the very next request, not after a restart. Returns `undefined`
 * when nothing is configured, which is R2's "no provider" state — the
 * feature is simply not offered rather than failing.
 */
export async function resolveImageClient(options: {
  readonly providerStore?: ProviderConfigStore
  readonly config?: {
    readonly provider: string
    readonly model: string
    // Explicitly `| undefined` rather than optional: this is exactly the shape
    // `config.imageGeneration` already has, and a site that names a provider
    // without ever setting its key is the normal half-configured state.
    readonly apiKey: string | undefined
    readonly baseUrl: string | undefined
  }
}): Promise<ImageProviderClient | undefined> {
  if (options.providerStore !== undefined) {
    const fromStore = await resolveImageProviderRegistryConfig(options.providerStore)
    const registry = createImageProviderRegistry(fromStore)
    const client = registry.first()
    if (client !== null) return client
  }

  const config = options.config
  if (config === undefined || config.apiKey === undefined || config.apiKey === '') return undefined
  if (config.provider !== 'openai' && config.provider !== 'stability') return undefined
  const registry = createImageProviderRegistry({
    [config.provider]: {
      apiKey: config.apiKey,
      model: config.model,
      ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
    },
  })
  return registry.first() ?? undefined
}
