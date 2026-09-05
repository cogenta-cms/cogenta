import type { DatabaseHandle } from '@cogenta/core'
import { createMenuStore, ensureMenuTables } from '@cogenta/schema'

/**
 * A blueprint's declarative navigation (L25 task A0b, D4): header, footer,
 * and an optional single call-to-action button — seeded through the real
 * `MenuStore` (`@cogenta/schema`), at the same locations `cogenta serve`'s
 * theme rendering already reads (`DEFAULT_HEADER_MENU_LOCATION` = `primary`,
 * `DEFAULT_FOOTER_MENU_LOCATION` = `footer`, and `header-action` — a
 * blueprint has no dependency on `@cogenta/cli` to name these, so the three
 * location strings are duplicated here rather than imported).
 */

export interface MenuItemSpec {
  readonly label: string
  /** Omitted only for the site's own `home` item — every other item needs a real path. */
  readonly url?: string
  readonly openInNewTab?: boolean
}

export interface BlueprintMenus {
  readonly header: readonly MenuItemSpec[]
  readonly footer: readonly MenuItemSpec[]
  /** A single button rendered in the header, distinct from the nav list — `ChromeInput.headerAction` (`theme@1.4`). */
  readonly headerAction?: MenuItemSpec
}

const HEADER_LOCATION = 'primary'
const FOOTER_LOCATION = 'footer'
const HEADER_ACTION_LOCATION = 'header-action'

async function seedOneMenu(
  store: ReturnType<typeof createMenuStore>,
  name: string,
  locale: string,
  location: string,
  items: readonly MenuItemSpec[],
): Promise<number> {
  if (items.length === 0) return 0
  const menu = await store.create({ name, locale, label: name, location })
  for (const item of items) {
    await store.createItem(menu.id, {
      label: item.label,
      kind: item.url === undefined ? 'home' : 'url',
      ...(item.url === undefined ? {} : { url: item.url }),
      ...(item.openInNewTab === undefined ? {} : { openInNewTab: item.openInNewTab }),
    })
  }
  return items.length
}

/** Seeds a blueprint's header/footer/header-action menus, one call, real `MenuStore`. Returns the total number of items seeded. */
export async function seedBlueprintMenus(
  db: DatabaseHandle,
  defaultLocale: string,
  menus: BlueprintMenus,
): Promise<number> {
  await ensureMenuTables(db)
  const store = createMenuStore({ db })
  let seeded = 0
  seeded += await seedOneMenu(store, 'header', defaultLocale, HEADER_LOCATION, menus.header)
  seeded += await seedOneMenu(store, 'footer', defaultLocale, FOOTER_LOCATION, menus.footer)
  if (menus.headerAction !== undefined) {
    seeded += await seedOneMenu(store, 'header-action', defaultLocale, HEADER_ACTION_LOCATION, [
      menus.headerAction,
    ])
  }
  return seeded
}
