import { associationContentPack, createAssociationContentPack } from './association.js'
import { blogContentPack, createBlogContentPack } from './blog.js'
import { type BlueprintContentPack, withLocalizedRouting } from './content-pack.js'
import { createDocumentationContentPack, documentationContentPack } from './documentation.js'
import { createMagazineContentPack, magazineContentPack } from './magazine.js'
import { createPortfolioContentPack, portfolioContentPack } from './portfolio.js'
import { createRestaurantContentPack, restaurantContentPack } from './restaurant.js'
import { createSaasContentPack, saasContentPack } from './saas.js'
import { createStoreContentPack, storeContentPack } from './store.js'
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
 * The blueprints written in more than one language (L36 for `vitrine`, then
 * one by one for the others): each builds its pack for the site's locale,
 * so a French site gets French content, addresses included.
 */
const LOCALIZED_CONTENT_PACKS: Readonly<
  Record<string, (locale: string, locales: readonly string[]) => BlueprintContentPack>
> = {
  vitrine: createVitrineContentPack,
  association: createAssociationContentPack,
  blog: createBlogContentPack,
  documentation: createDocumentationContentPack,
  magazine: createMagazineContentPack,
  portfolio: createPortfolioContentPack,
  restaurant: createRestaurantContentPack,
  saas: createSaasContentPack,
  store: createStoreContentPack,
}

/**
 * The pack to scaffold for a blueprint in a given site locale. A blueprint
 * written in one language only returns the same pack whatever the locale.
 *
 * `locales` is every language the site is set up with. With more than one,
 * the routed collections are served under a locale prefix — the default
 * language unprefixed, the others at `/<locale>/…` — so that a translation
 * has a URL of its own; a blueprint that ships the other language's words
 * (`blog`) also seeds them as translations.
 */
export function contentPackFor(
  id: string,
  locale: string,
  locales: readonly string[] = [locale],
): BlueprintContentPack | undefined {
  const pack = LOCALIZED_CONTENT_PACKS[id]?.(locale, locales) ?? BLUEPRINT_CONTENT_PACKS[id]
  return pack !== undefined && new Set(locales).size > 1 ? withLocalizedRouting(pack) : pack
}
