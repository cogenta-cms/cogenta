import { CogentaError } from '@cogenta/core'

/**
 * The materialised path of a taxonomy tree (ADR-0022).
 *
 * A path is the ids of every ancestor and of the term itself, each wrapped in
 * slashes: `/a/`, `/a/b/`, `/a/b/c/`. Three properties follow, and all three
 * are why this shape was chosen over a bare `parent_id` walked by a recursive
 * CTE:
 *
 * 1. **A subtree is a `like`.** `path like '/a/b/%'` is one index-backed
 *    predicate that Postgres, MySQL/MariaDB and SQLite treat identically —
 *    unlike `with recursive`, whose support and syntax diverge (ADR-0006).
 * 2. **Ids, not slugs.** Renaming a term rewrites no path at all. Only a
 *    *move* rewrites, and only the subtree that actually moved.
 * 3. **The leading and trailing slashes are load-bearing.** Without them
 *    `/a/b` would prefix-match `/a/bb`, and a sibling would read as a child.
 */

/** Slashes plus a 36-character UUID per level. */
const SEGMENT_LENGTH = 37

/**
 * Deep enough for any category tree a human maintains, shallow enough that the
 * column stays inside the index-key limit InnoDB allows in utf8mb4.
 */
export const MAX_TAXONOMY_DEPTH = 12

/** `varchar(n)` of the path column: one leading slash plus the segments. */
export const TAXONOMY_PATH_LENGTH = SEGMENT_LENGTH * MAX_TAXONOMY_DEPTH + 1

/** The path of a term, given its parent's path (`''` at the root). */
export function childPath(parentPath: string, id: string): string {
  return parentPath === '' ? `/${id}/` : `${parentPath}${id}/`
}

/** 0 at the root. Derived, never stored twice: a second copy is a second truth. */
export function depthOf(path: string): number {
  return path.split('/').filter((segment) => segment !== '').length - 1
}

/** True when `path` is the term itself or anything beneath it. */
export function isWithin(path: string, ancestorPath: string): boolean {
  return path.startsWith(ancestorPath)
}

/** True when `path` is strictly beneath `ancestorPath`. */
export function isBelow(path: string, ancestorPath: string): boolean {
  return path !== ancestorPath && path.startsWith(ancestorPath)
}

/**
 * The path a subtree gets once it hangs under a new parent.
 *
 * Every descendant is rewritten by swapping the moved term's old prefix for
 * its new one, which is exactly the "maintained on write" half of the bargain
 * a materialised path strikes: reads are cheap because moves pay.
 */
export function rebasedPath(path: string, fromPrefix: string, toPrefix: string): string {
  return `${toPrefix}${path.slice(fromPrefix.length)}`
}

export function assertDepth(taxonomy: string, path: string): void {
  const depth = depthOf(path)
  if (depth < MAX_TAXONOMY_DEPTH) return

  throw new CogentaError({
    code: 'TAXONOMY_TOO_DEEP',
    message: `A "${taxonomy}" term cannot be nested more than ${MAX_TAXONOMY_DEPTH} levels deep.`,
    hint: 'The tree is stored as a materialised path, whose column is bounded. Flatten this branch — a classification nobody can navigate is not classifying anything.',
    details: { taxonomy, depth, max: MAX_TAXONOMY_DEPTH },
  })
}
