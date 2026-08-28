export { type ExifData, type ExifGps, hasGpsData, readExif, stripGpsFromJpeg } from './exif.js'
export {
  assertMediaFolderDepth,
  childFolderPath,
  folderDepthOf,
  isBelowFolder,
  isWithinFolder,
  MAX_MEDIA_FOLDER_DEPTH,
  MEDIA_FOLDER_PATH_LENGTH,
  rebasedFolderPath,
} from './folder-path.js'
export {
  createDatabaseMediaFolderStore,
  type DatabaseMediaFolderStoreOptions,
  MEDIA_FOLDER_TABLE,
} from './folder-store.js'
export { describeContainer, type SniffedImageFormat, sniffImageFormat } from './format-sniff.js'
export { createDatabaseMediaStore, type DatabaseMediaStoreOptions, MEDIA_TABLE } from './store.js'
export type {
  CreateMediaFolderInput,
  CreateMediaInput,
  FocalPoint,
  ListMediaFoldersOptions,
  ListMediaOptions,
  MediaAsset,
  MediaFolder,
  MediaFolderStore,
  MediaKind,
  MediaPage,
  MediaSortField,
  MediaStore,
  ReplaceMediaInput,
  UpdateMediaFolderInput,
  UpdateMediaInput,
} from './types.js'
export { MEDIA_KINDS } from './types.js'
