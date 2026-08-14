import { blogContentPack } from './blog.js'
import type { BlueprintContentPack } from './content-pack.js'
import { documentationContentPack } from './documentation.js'
import { portfolioContentPack } from './portfolio.js'
import { vitrineContentPack } from './vitrine.js'

/**
 * Every blueprint beyond `blank` that has a real content pack, keyed by its
 * `Blueprint.id` (`./registry.js`). A blueprint listed in `BLUEPRINTS` but
 * absent here has no pack yet — `scaffoldSite` treats that exactly like
 * `blank` for content purposes, which is honest: `resolveBlueprint` already
 * refuses to hand out an `available: false` blueprint in the first place.
 */
export const BLUEPRINT_CONTENT_PACKS: Readonly<Record<string, BlueprintContentPack>> = {
  blog: blogContentPack,
  vitrine: vitrineContentPack,
  portfolio: portfolioContentPack,
  documentation: documentationContentPack,
}
