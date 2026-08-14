import { associationContentPack } from './association.js'
import { blogContentPack } from './blog.js'
import type { BlueprintContentPack } from './content-pack.js'
import { documentationContentPack } from './documentation.js'
import { magazineContentPack } from './magazine.js'
import { portfolioContentPack } from './portfolio.js'
import { restaurantContentPack } from './restaurant.js'
import { saasContentPack } from './saas.js'
import { vitrineContentPack } from './vitrine.js'

/**
 * Every blueprint beyond `blank` that has a real content pack, keyed by its
 * `Blueprint.id` (`./registry.js`). Every blueprint listed in `BLUEPRINTS`
 * now has one (L9 task 8, batch B) — `blank` remains the only one without,
 * which is honest: it is the empty schema by design, never `resolveBlueprint`
 * handing out an `available: false` blueprint.
 */
export const BLUEPRINT_CONTENT_PACKS: Readonly<Record<string, BlueprintContentPack>> = {
  blog: blogContentPack,
  vitrine: vitrineContentPack,
  portfolio: portfolioContentPack,
  documentation: documentationContentPack,
  magazine: magazineContentPack,
  association: associationContentPack,
  restaurant: restaurantContentPack,
  saas: saasContentPack,
}
