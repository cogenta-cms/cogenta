export { type ExifData, type ExifGps, hasGpsData, readExif, stripGpsFromJpeg } from './exif.js'
export { describeContainer, type SniffedImageFormat, sniffImageFormat } from './format-sniff.js'
export { createDatabaseMediaStore, type DatabaseMediaStoreOptions } from './store.js'
export type {
  CreateMediaInput,
  FocalPoint,
  ListMediaOptions,
  MediaAsset,
  MediaKind,
  MediaPage,
  MediaSortField,
  MediaStore,
  ReplaceMediaInput,
  UpdateMediaInput,
} from './types.js'
export { MEDIA_KINDS } from './types.js'
