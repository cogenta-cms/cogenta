import { CogentaError } from '../errors/index.js'

/**
 * The materialised path of a media folder tree (fiche 46).
 *
 * Deliberately the same shape as `@cogenta/schema`'s `store/taxonomy-path.ts`
 * (ADR-0022) — a subtree is one `like`, a rename rewrites nothing, only a
 * move pays. It is a *separate, local* copy rather than an import: this
 * package is `@cogenta/core`, the foundation every other package (including
 * `@cogenta/schema`) depends on, and a media folder is core's own concept (a
 * `MediaAsset` already lives here). Importing from `@cogenta/schema` here
 * would invert that dependency direction. The arithmetic is ~15 lines of
 * pure string manipulation — duplicating it is cheaper and safer than
 * bending the package graph for it.
 */

const SEGMENT_LENGTH = 37

/** Deep enough for any folder tree a human maintains; matches the taxonomy tree's own bound. */
export const MAX_MEDIA_FOLDER_DEPTH = 12

/** `varchar(n)` of the path column: one leading slash plus the segments. */
export const MEDIA_FOLDER_PATH_LENGTH = SEGMENT_LENGTH * MAX_MEDIA_FOLDER_DEPTH + 1

/** The path of a folder, given its parent's path (`''` at the root). */
export function childFolderPath(parentPath: string, id: string): string {
  return parentPath === '' ? `/${id}/` : `${parentPath}${id}/`
}

/** 0 at the root. */
export function folderDepthOf(path: string): number {
  return path.split('/').filter((segment) => segment !== '').length - 1
}

/** True when `path` is the folder itself or anything beneath it. */
export function isWithinFolder(path: string, ancestorPath: string): boolean {
  return path.startsWith(ancestorPath)
}

/** True when `path` is strictly beneath `ancestorPath`. */
export function isBelowFolder(path: string, ancestorPath: string): boolean {
  return path !== ancestorPath && path.startsWith(ancestorPath)
}

/** The path a moved subtree gets once it hangs under a new parent. */
export function rebasedFolderPath(path: string, fromPrefix: string, toPrefix: string): string {
  return `${toPrefix}${path.slice(fromPrefix.length)}`
}

export function assertMediaFolderDepth(path: string): void {
  const depth = folderDepthOf(path)
  if (depth < MAX_MEDIA_FOLDER_DEPTH) return

  throw new CogentaError({
    code: 'MEDIA_FOLDER_TOO_DEEP',
    message: `A media folder cannot be nested more than ${MAX_MEDIA_FOLDER_DEPTH} levels deep.`,
    hint: 'The tree is stored as a materialised path, whose column is bounded. Flatten this branch.',
    details: { depth, max: MAX_MEDIA_FOLDER_DEPTH },
  })
}
