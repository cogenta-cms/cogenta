import { associationContentPack } from './association.js'
import { blogContentPack } from './blog.js'
import type { BlueprintContentPack } from './content-pack.js'
import { documentationContentPack } from './documentation.js'
import { magazineContentPack } from './magazine.js'
import { portfolioContentPack } from './portfolio.js'
import { restaurantContentPack } from './restaurant.js'
import { saasContentPack } from './saas.js'
import { storeContentPack } from './store.js'
import { createVitrineContentPack, vitrineContentPack } from './vitrine.js'

/**
 * Every blueprint beyond `blank` that has a real content pack, keyed by its
 * `Blueprint.id` (`create-cogenta`'s `src/blueprints/registry.ts`, which
 * stays with the installer's menu). Every blueprint listed in `BLUEPRINTS`
 * now has one (L9 task 8, batch B, plus `store` in L22 task 10) — `blank`
 * remains the only one without, which is honest: it is the empty schema by
 * design, never `resolveBlueprint` handing out an `available: false`
 * blueprint.
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
  store: storeContentPack,
}

/**
 * The pack to scaffold for a blueprint in a given site locale (L36). Most
 * blueprints ship one language and return the same pack whatever the locale;
 * `vitrine` is written in French and in English, and a French site gets the
 * French one, addresses included.
 */
export function contentPackFor(id: string, locale: string): BlueprintContentPack | undefined {
  if (id === 'vitrine') return createVitrineContentPack(locale)
  return BLUEPRINT_CONTENT_PACKS[id]
}
