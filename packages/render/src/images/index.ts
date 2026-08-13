import { createDriverRegistry, type DriverRegistry, type Logger } from '@cogenta/core'
import { sharpImageDriver } from './sharp.js'
import type { ImageConfig, ImageTransformer } from './types.js'
import { wasmImageDriver } from './wasm.js'

export { decodeFailedError, unsupportedFormatError } from './errors.js'
export { contentTypeOf, describeContainer, sniffImageFormat, suffixOf } from './format.js'
export type { VariantRequest } from './geometry.js'
export { DEFAULT_QUALITY, focalCrop, MAX_DIMENSION, outputSize, planTransform } from './geometry.js'
export type { ImagePipeline, ImagePipelineOptions, VariantParameters } from './pipeline.js'
export { createImagePipeline, parseVariantParameters, variantKey } from './pipeline.js'
export { createSharpTransformer, loadSharpModule, sharpImageDriver } from './sharp.js'
export type { SourceOptions } from './srcset.js'
export { candidateWidths, describeMedia, SRCSET_WIDTHS, variantUrl } from './srcset.js'
export type { MemoryVariantStoreOptions, VariantStore } from './store.js'
export { createMemoryVariantStore } from './store.js'
export type {
  FocalPoint,
  ImageConfig,
  ImageFit,
  ImageFormat,
  ImageMetadata,
  ImageOptions,
  ImageSource,
  ImageTransformer,
  MediaAsset,
  Rect,
  RenderedVariant,
  Size,
  TransformOperation,
} from './types.js'
export { IMAGE_FORMATS } from './types.js'
export { createWasmTransformer, loadVips, wasmImageDriver } from './wasm.js'

export interface ImageRegistryOptions {
  readonly logger?: Logger
}

/**
 * The image drivers Cogenta ships, in tier order.
 *
 * `sharp` first when it is installed, WebAssembly libvips otherwise — and the
 * fallback is not a courtesy. Rule R10 and the L3 spec both say it plainly:
 * `sharp` does not install everywhere, so the tier that always works is the one
 * the default install gets.
 */
export function createImageRegistry(
  options: ImageRegistryOptions = {},
): DriverRegistry<ImageTransformer, ImageConfig> {
  const registry = createDriverRegistry<ImageTransformer, ImageConfig>({
    need: 'images',
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  })

  registry.register(sharpImageDriver())
  registry.register(wasmImageDriver())

  return registry
}
