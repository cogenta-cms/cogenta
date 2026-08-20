import type { SkinTokens } from './tokens.js'
import { TOKEN_GROUPS } from './tokens.js'

/**
 * A partial skin, as an admin's token override screen sends it (fiche 14
 * task 2): any subset of any group's keys, never a whole new shape. The type
 * is structural rather than `Partial<SkinTokens>` recursed, because the
 * overlay travels as parsed JSON, one HTTP hop away from the object it will
 * be merged onto.
 */
export type SkinTokenOverrides = {
  readonly [Group in keyof SkinTokens]?: Partial<SkinTokens[Group]>
}

/**
 * Overlays a partial set of token overrides onto a complete base skin,
 * group by group, key by key — never a shallow `{ ...base, ...overrides }`,
 * which would replace an entire group (say, all seven `color.*` tokens) the
 * moment an override touches a single key in it.
 *
 * The result is a plain object shaped like `SkinTokens`, not yet validated:
 * callers run it back through `validateSkin` before trusting it, the same
 * discipline `applyTokens` in `cogenta skin apply` already applies to a
 * skin read straight off disk. Merging is deliberately naive about
 * *values* — it does not know a colour from a duration — so it cannot mask
 * a bad override; only `validateSkin` decides what a value means.
 */
export function mergeSkinTokens(base: SkinTokens, overrides: SkinTokenOverrides): SkinTokens {
  const merged = { ...base } as Record<string, unknown>
  for (const group of TOKEN_GROUPS) {
    const groupOverrides = overrides[group]
    if (groupOverrides === undefined) continue
    merged[group] = { ...(base[group] as Record<string, unknown>), ...groupOverrides }
  }
  return merged as unknown as SkinTokens
}
