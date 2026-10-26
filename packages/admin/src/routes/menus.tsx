import { type FormEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeApiError } from '../api/describe-error.js'
import {
  createMenu,
  createMenuItem,
  deleteMenu,
  deleteMenuItem,
  getMenu,
  listMenus,
  type Menu,
  type MenuItem,
  type MenuItemKind,
  reorderMenuItems,
  updateMenu,
} from '../api/menu-client.js'
import { useAuth } from '../auth/auth-context.js'
import { ConfirmDialog } from '../commerce/confirm-dialog.js'
import { ItemEditModal } from '../menus/item-edit-modal.js'
import { MenuEntryPicker } from '../menus/menu-entry-picker.js'
import { MenuTermPicker } from '../menus/menu-term-picker.js'
import { MenuTree } from '../menus/menu-tree.js'
import { buildReorderPayload } from '../menus/menu-tree-ops.js'
import { useSchema } from '../schema/schema-context.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Label,
  Notice,
  Select,
} from '../ui/index.js'

/**
 * Navigation menus: a named tree of links, edited entirely at runtime — a
 * menu is not declared in the site's schema the way a collection or a
 * taxonomy is, and it carries no version, no trash and no translation
 * family of its own (contract A's model, deliberately not grafted on here —
 * see `menu-store.ts`). Write controls only appear for an actor who may use
 * them; the server refuses the rest regardless (R4), so hiding a button here
 * is courtesy, not security.
 *
 * `location` stays the free-text field the API already carries (fiche 09,
 * task 3, no schema change) — `theme-render.ts` resolves whatever string is
 * there, and a future second theme with different slot names needs no code
 * change here. What changed (fiche 21, task 1) is the *control*: a bare text
 * input next to a datalist hint let an editor type `primery` or `Primary`
 * and never notice the header stayed empty. `primary` and `footer` are this
 * stand-in theme's two slots (`DEFAULT_HEADER_MENU_LOCATION` /
 * `DEFAULT_FOOTER_MENU_LOCATION` in `theme-render.ts`), offered as
 * unambiguous named choices; "Other" reveals the free-text field for a
 * theme that names its slots differently.
 */
type LocationMode = 'none' | 'primary' | 'footer' | 'custom'

/** The two slots this stand-in theme understands out of the box (mirrors `theme-render.ts`'s defaults) — anything else falls under "Other". */
function modeForLocation(location: string | null): LocationMode {
  if (location === null || location === '') return 'none'
  if (location === 'primary' || location === 'footer') return location
  return 'custom'
}

/** Same policy as the server's `isSafeMenuUrl`: http(s), mailto, tel or a relative path, nothing ambiguous. */
function isSafeMenuUrl(value: string): boolean {
  if (value.length === 0 || /[\s\p{Cc}\\]/u.test(value)) return false
  try {
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(
      new URL(value, 'https://menu.invalid/').protocol,
    )
  } catch {
    return false
  }
}

/** "Menu principal — en-tête", plus the language only when the site has several. */
function menuOptionLabel(menu: Menu, multilingual: boolean, t: (key: string) => string): string {
  const place =
    menu.location === null || menu.location === ''
      ? null
      : menu.location === 'primary'
        ? t('menus.locationPrimary')
        : menu.location === 'footer'
          ? t('menus.locationFooter')
          : menu.location
  const parts = [...(multilingual ? [menu.locale] : []), ...(place === null ? [] : [place])]
  return parts.length === 0 ? menu.label : `${menu.label} — ${parts.join(' · ')}`
}

export function MenusRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const mayWrite = roles.includes('admin') || roles.includes('editor')

  const collections = schemaState.status === 'ready' ? schemaState.schema.collections : []
  const taxonomies = schemaState.status === 'ready' ? (schemaState.schema.taxonomies ?? []) : []
  const locales =
    schemaState.status === 'ready'
      ? (schemaState.schema.site?.locales ?? [i18n.language])
      : [i18n.language]

  const [menus, setMenus] = useState<readonly Menu[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<readonly MenuItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [itemError, setItemError] = useState<string | null>(null)
  const [menuToDelete, setMenuToDelete] = useState<Menu | null>(null)
  const [showNewMenu, setShowNewMenu] = useState(false)

  // New menu form.
  const [newName, setNewName] = useState('')
  const [newLocale, setNewLocale] = useState(locales[0] ?? 'en')
  const [newLabel, setNewLabel] = useState('')
  const [creatingMenu, setCreatingMenu] = useState(false)

  // Location (fiche 09 task 3; control redesigned in fiche 21 task 1).
  const [locationMode, setLocationMode] = useState<LocationMode>('none')
  const [customLocationDraft, setCustomLocationDraft] = useState('')
  const [savingLocation, setSavingLocation] = useState(false)

  // New item form.
  const [itemKind, setItemKind] = useState<MenuItemKind>('url')
  const [itemLabel, setItemLabel] = useState('')
  const [itemUrl, setItemUrl] = useState('')
  const [itemCollection, setItemCollection] = useState(collections[0]?.name ?? '')
  const [itemEntryId, setItemEntryId] = useState<string | null>(null)
  const [itemTaxonomy, setItemTaxonomy] = useState(taxonomies[0]?.name ?? '')
  const [itemTermId, setItemTermId] = useState<string | null>(null)
  const [itemParent, setItemParent] = useState('')
  const [creatingItem, setCreatingItem] = useState(false)

  // Edit modal (task 1).
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)

  // Duplicate (task 5).
  const [duplicateLocale, setDuplicateLocale] = useState(locales[0] ?? 'en')
  const [duplicating, setDuplicating] = useState(false)

  const loadMenus = useCallback(async () => {
    if (token === null) return
    setError(null)
    try {
      setMenus(await listMenus(token))
    } catch (caught) {
      setError(describeApiError(caught, t('menus.loadError')).message)
    }
  }, [token, t])

  // `locales`/`collections`/`taxonomies` are all `[]` (or `[i18n.language]`
  // for `locales`, the *admin's own* UI language — never the site's) until
  // `useSchema()` resolves; every `useState(x[0] ?? fallback)` above reads
  // that placeholder at mount and is never told the real value arrived, so
  // it keeps proposing (and, unless the admin happens to click the field,
  // silently submitting) a locale/collection/taxonomy nothing on the site
  // actually has. Found end to end, 2026-08-27: "Dupliquer vers la langue"
  // rendered "en" (the schema's real, sole locale, in the now-current
  // options list) while its value stayed the stale 'fr' from before the
  // schema loaded — a duplicate silently landed in the wrong locale with
  // the control visibly showing the right one. Corrected only when the
  // current value is no longer a real option, so a deliberate mid-session
  // choice is never overwritten out from under the admin.
  useEffect(() => {
    if (schemaState.status !== 'ready') return
    setNewLocale((current) => (locales.includes(current) ? current : (locales[0] ?? current)))
    setDuplicateLocale((current) => (locales.includes(current) ? current : (locales[0] ?? current)))
    setItemCollection((current) =>
      collections.some((collection) => collection.name === current)
        ? current
        : (collections[0]?.name ?? current),
    )
    setItemTaxonomy((current) =>
      taxonomies.some((taxonomy) => taxonomy.name === current)
        ? current
        : (taxonomies[0]?.name ?? current),
    )
    // Only once per schema readiness transition, not on every locales/
    // collections/taxonomies re-render (those are recomputed every render
    // from `schemaState`, so referencing them here would re-run this loop
    // on every keystroke elsewhere on the page).
  }, [schemaState.status])

  useEffect(() => {
    void loadMenus()
  }, [loadMenus])

  // Reported live, 2026-08-29: an admin edited a menu, added a real item, and
  // it never appeared on the site — because the menu that happened to load
  // first (`menus[0]`, API order, no locale awareness at all) was `fr` on a
  // site whose schema declares only `en`. The edit was never lost; it was
  // never going to be visible on any page this site serves. Preferring a
  // menu whose `locale` the site actually declares is what a first-time
  // admin needs by default; it does not stop anyone from picking a
  // leftover/foreign-locale menu deliberately from the selector afterwards.
  //
  // Gated on `schemaState.status === 'ready'`, the same race this file's own
  // `newLocale`/`itemCollection`/`itemTaxonomy` effect above already guards
  // against: `menus` frequently resolves before the schema does, and at that
  // moment `locales` is still `[i18n.language]` — the *admin's* UI language,
  // not the site's — which would otherwise "correctly" match a leftover `fr`
  // menu on an `en`-only site the instant the admin's own UI happens to be
  // in French, defeating this fix in exactly the case it exists for. Not
  // depending on `locales` while waiting keeps this from re-firing (and
  // silently swapping the selection) on every later schema refetch too.
  useEffect(() => {
    if (selectedId !== null || menus.length === 0 || schemaState.status !== 'ready') return
    const relevant = menus.find((menu) => locales.includes(menu.locale))
    const first = relevant ?? menus[0]
    if (first !== undefined) setSelectedId(first.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menus, selectedId, schemaState.status])

  const loadItems = useCallback(async () => {
    if (token === null || selectedId === null) {
      setItems([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const menu = await getMenu(token, selectedId)
      setItems(menu.items)
    } catch (caught) {
      setError(describeApiError(caught, t('menus.loadError')).message)
    } finally {
      setLoading(false)
    }
  }, [token, selectedId, t])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const selected = menus.find((menu) => menu.id === selectedId) ?? null

  useEffect(() => {
    const location = selected?.location ?? null
    setLocationMode(modeForLocation(location))
    setCustomLocationDraft(modeForLocation(location) === 'custom' ? (location ?? '') : '')
  }, [selected])

  async function submitNewMenu(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setCreatingMenu(true)
    setError(null)
    setNotice(null)
    try {
      const menu = await createMenu(token, { name: newName, locale: newLocale, label: newLabel })
      setNewName('')
      setNewLabel('')
      await loadMenus()
      setSelectedId(menu.id)
      setShowNewMenu(false)
      setNotice(t('menus.created', { name: menu.label }))
    } catch (caught) {
      setError(describeApiError(caught, t('menus.createMenuError')).message)
    } finally {
      setCreatingMenu(false)
    }
  }

  async function removeMenu(menu: Menu): Promise<void> {
    if (token === null) return
    setError(null)
    try {
      await deleteMenu(token, menu.id, { cascade: true })
      setSelectedId(null)
      await loadMenus()
      setNotice(t('menus.deleted', { name: menu.label }))
    } catch (caught) {
      setError(describeApiError(caught, t('menus.deleteMenuError')).message)
    }
  }

  async function saveLocation(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || selected === null) return
    const location =
      locationMode === 'none'
        ? null
        : locationMode === 'custom'
          ? customLocationDraft.trim() === ''
            ? null
            : customLocationDraft.trim()
          : locationMode
    setSavingLocation(true)
    setError(null)
    try {
      await updateMenu(token, selected.id, { location })
      await loadMenus()
      setNotice(t('menus.locationSaved'))
    } catch (caught) {
      setError(describeApiError(caught, t('menus.locationError')).message)
    } finally {
      setSavingLocation(false)
    }
  }

  async function submitNewItem(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || selectedId === null) return
    setItemError(null)
    setNotice(null)
    if (itemKind === 'url' && !isSafeMenuUrl(itemUrl)) {
      setItemError(t('menus.urlInvalid'))
      return
    }
    if (itemKind === 'entry' && itemEntryId === null) {
      setItemError(t('menus.entryRequired'))
      return
    }
    if (itemKind === 'taxonomy' && itemTermId === null) {
      setItemError(t('menus.termRequired'))
      return
    }
    setCreatingItem(true)
    setError(null)
    try {
      await createMenuItem(token, selectedId, {
        label: itemLabel,
        kind: itemKind,
        parent: itemParent === '' ? null : itemParent,
        ...(itemKind === 'url' ? { url: itemUrl } : {}),
        ...(itemKind === 'entry'
          ? { targetCollection: itemCollection, targetEntryId: itemEntryId }
          : {}),
        ...(itemKind === 'taxonomy'
          ? { targetTaxonomy: itemTaxonomy, targetTermId: itemTermId }
          : {}),
      })
      setItemLabel('')
      setItemUrl('')
      setItemEntryId(null)
      setItemTermId(null)
      await loadItems()
      setNotice(t('menus.itemAdded'))
    } catch (caught) {
      setItemError(describeApiError(caught, t('menus.createItemError')).message)
    } finally {
      setCreatingItem(false)
    }
  }

  async function removeItem(item: MenuItem): Promise<void> {
    if (token === null || selectedId === null) return
    setError(null)
    try {
      await deleteMenuItem(token, selectedId, item.id, { cascade: true })
      await loadItems()
    } catch (caught) {
      setError(describeApiError(caught, t('menus.deleteItemError')).message)
    }
  }

  /**
   * The one write path every reorder — a button click or a drop — funnels
   * through: the whole tree, in one `PATCH /api/menus/{id}/items` call
   * (fiche 09, task 2). `MenuTree` already computed the resulting shape
   * client-side with the pure ops in `menu-tree-ops.ts`; this only turns it
   * into the batch payload and commits it. On failure the local tree is
   * reloaded from the server rather than kept — an optimistic shape this
   * screen believed in but the server refused must not linger on screen.
   */
  async function commitReorder(next: readonly MenuItem[]): Promise<void> {
    if (token === null || selectedId === null) return
    setSaving(true)
    setError(null)
    const previous = items
    setItems(next)
    try {
      await reorderMenuItems(token, selectedId, buildReorderPayload(next))
    } catch (caught) {
      setItems(previous)
      setError(describeApiError(caught, t('menus.reorderError')).message)
    } finally {
      setSaving(false)
    }
  }

  async function duplicateToLocale(): Promise<void> {
    if (token === null || selected === null) return
    setDuplicating(true)
    setError(null)
    try {
      const twin = await createMenu(token, {
        name: `${selected.name}-${duplicateLocale}`,
        locale: duplicateLocale,
        label: selected.label,
      })
      // Sequential, deliberately: each call creates a brand new row, never
      // rewrites an existing one, so a failure partway through leaves a
      // partial (inspectable, deletable) duplicate rather than a
      // half-rewritten *existing* tree — the property task 2's single
      // transaction protects is a different one from this.
      const idMap = new Map<string, string>()
      for (const source of items) {
        const created = await createMenuItem(token, twin.id, {
          label: source.label,
          kind: source.kind,
          parent: source.parent === null ? null : (idMap.get(source.parent) ?? null),
          targetCollection: source.targetCollection,
          targetEntryId: source.targetEntryId,
          targetTaxonomy: source.targetTaxonomy,
          targetTermId: source.targetTermId,
          url: source.url,
          title: source.title,
          openInNewTab: source.openInNewTab,
        })
        idMap.set(source.id, created.id)
      }
      await loadMenus()
      setSelectedId(twin.id)
    } catch (caught) {
      setError(describeApiError(caught, t('menus.duplicateError')).message)
    } finally {
      setDuplicating(false)
    }
  }

  // A dead-link summary (task 4): every `entry` item this actor can see is
  // not `published`, or resolved to nothing at all. Computed from data the
  // page already fetched — no second request just to count a warning.
  const problemCount = useMemo(
    () =>
      items.filter(
        (item) =>
          item.kind === 'entry' &&
          ((item.resolvedHealth !== undefined && item.resolvedHealth !== 'published') ||
            (item.targetEntryId !== null && item.resolvedLabel === undefined)),
      ).length,
    [items],
  )

  // Locale coverage for the selected menu's own location: a location is a
  // per-locale slot (`byLocation(location, locale)`, `theme-render.ts`), so
  // assigning this menu to, say, "primary" only ever fills that slot for
  // *this* menu's own locale — a visitor on any other declared locale still
  // gets an empty header, with nothing in this screen ever saying so (found
  // auditing this screen end to end, 2026-08-27: a `fr` menu assigned to
  // "primary" on a site whose pages actually serve `en` rendered no
  // navigation at all, silently). Computed from `menus`/`locales` already
  // in hand — no second request.
  const uncoveredLocales = useMemo(() => {
    if (selected === null || selected.location === null || selected.location === '') return []
    return locales.filter(
      (locale) =>
        !menus.some((menu) => menu.location === selected.location && menu.locale === locale),
    )
  }, [selected, menus, locales])

  // Reported live, 2026-08-29: an admin edited this exact menu, added a real
  // item, and it never reached the site — this menu's own `locale` (`fr`)
  // was not one the site's schema declares at all (`en` only), a leftover
  // from earlier testing. `uncoveredLocales` above catches the opposite
  // shape (a declared locale with no menu at all); it says nothing when the
  // menu itself belongs to a locale the site never serves.
  const isForeignLocale =
    selected !== null && schemaState.status === 'ready' && !locales.includes(selected.locale)

  if (schemaState.status === 'loading') return <p>{t('common.loading')}</p>
  if (schemaState.status === 'error') {
    return <p role="alert">{t('common.schemaError', { message: schemaState.message })}</p>
  }

  return (
    <section aria-labelledby="menus-heading" className="flex flex-col gap-4">
      <h1 id="menus-heading">{t('menus.heading')}</h1>
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {notice !== null && (
        <Notice
          tone="success"
          live="polite"
          onDismiss={() => setNotice(null)}
          dismissLabel={t('common.close')}
        >
          <p>{notice}</p>
        </Notice>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex w-full min-w-0 max-w-full flex-col gap-1.5 sm:w-auto sm:flex-1">
          <Label htmlFor="menu-select">{t('menus.menu')}</Label>
          <Select
            className="min-w-0 max-w-full"
            id="menu-select"
            value={selectedId ?? ''}
            onChange={(event) =>
              setSelectedId(event.target.value === '' ? null : event.target.value)
            }
          >
            <option value="">{t('menus.none')}</option>
            {menus.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {menuOptionLabel(menu, locales.length > 1, t)}
              </option>
            ))}
          </Select>
        </div>
        {mayWrite && (
          <Button
            type="button"
            variant="secondary"
            aria-expanded={showNewMenu || menus.length === 0}
            onClick={() => setShowNewMenu((current) => !current)}
          >
            {t('menus.newMenu')}
          </Button>
        )}
      </div>

      {mayWrite && (showNewMenu || menus.length === 0) && (
        <Card aria-labelledby="new-menu-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="new-menu-heading">{t('menus.newMenu')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <form
              onSubmit={(event) => void submitNewMenu(event)}
              className="grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-2"
            >
              <Field className="min-w-0" label={t('menus.name')}>
                {(control) => (
                  <Input
                    className="min-w-0"
                    {...control}
                    value={newName}
                    required
                    onChange={(event) => setNewName(event.target.value)}
                  />
                )}
              </Field>
              <div className="flex min-w-0 max-w-full flex-col gap-1.5">
                <Label htmlFor="menu-locale">{t('menus.locale')}</Label>
                <Select
                  className="min-w-0 max-w-full"
                  id="menu-locale"
                  value={newLocale}
                  onChange={(event) => setNewLocale(event.target.value)}
                >
                  {locales.map((locale) => (
                    <option key={locale} value={locale}>
                      {locale}
                    </option>
                  ))}
                </Select>
              </div>
              <Field className="min-w-0" label={t('menus.label')}>
                {(control) => (
                  <Input
                    className="min-w-0"
                    {...control}
                    value={newLabel}
                    required
                    onChange={(event) => setNewLabel(event.target.value)}
                  />
                )}
              </Field>
              <Button type="submit" disabled={creatingMenu} className="justify-self-start">
                {t('menus.create')}
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      {selected !== null && (
        <>
          {mayWrite && (
            <Card aria-labelledby="menu-location-heading">
              <CardHeader>
                <CardTitle>
                  <h2 id="menu-location-heading">{t('menus.locationHeading')}</h2>
                </CardTitle>
              </CardHeader>
              <CardBody>
                <form
                  onSubmit={(event) => void saveLocation(event)}
                  className="grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-2"
                >
                  <div className="flex min-w-0 max-w-full flex-col gap-1.5">
                    <Label htmlFor="menu-location">{t('menus.location')}</Label>
                    <Select
                      className="min-w-0 max-w-full"
                      id="menu-location"
                      aria-describedby="menu-location-hint"
                      value={locationMode}
                      onChange={(event) => setLocationMode(event.target.value as LocationMode)}
                    >
                      <option value="none">{t('menus.locationNone')}</option>
                      <option value="primary">{t('menus.locationPrimary')}</option>
                      <option value="footer">{t('menus.locationFooter')}</option>
                      <option value="custom">{t('menus.locationCustom')}</option>
                    </Select>
                    <p id="menu-location-hint" className="text-sm text-muted-foreground">
                      {t('menus.locationHint')}
                    </p>
                  </div>
                  {locationMode === 'custom' && (
                    <Field className="min-w-0" label={t('menus.locationCustomLabel')}>
                      {(control) => (
                        <Input
                          className="min-w-0"
                          {...control}
                          value={customLocationDraft}
                          onChange={(event) => setCustomLocationDraft(event.target.value)}
                        />
                      )}
                    </Field>
                  )}
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={savingLocation}
                    className="justify-self-start"
                  >
                    {t('menus.saveLocation')}
                  </Button>
                </form>
                {locales.length > 1 && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex min-w-0 max-w-full flex-col gap-1.5">
                      <Label htmlFor="duplicate-locale">{t('menus.duplicateTo')}</Label>
                      <Select
                        className="min-w-0 max-w-full"
                        id="duplicate-locale"
                        value={duplicateLocale}
                        onChange={(event) => setDuplicateLocale(event.target.value)}
                      >
                        {locales.map((locale) => (
                          <option key={locale} value={locale}>
                            {locale}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={duplicating}
                      onClick={() => void duplicateToLocale()}
                    >
                      {t('menus.duplicate')}
                    </Button>
                  </div>
                )}
                <div className="mt-4 border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive-surface hover:text-destructive"
                    onClick={() => setMenuToDelete(selected)}
                  >
                    {t('menus.deleteMenu')}
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {problemCount > 0 && (
            <Notice tone="warning" title={t('menus.problemsTitle', { count: problemCount })}>
              {t('menus.problemsBody')}
            </Notice>
          )}

          {uncoveredLocales.length > 0 && (
            <Notice tone="warning" title={t('menus.localeCoverageTitle')}>
              {t('menus.localeCoverageBody', { locales: uncoveredLocales.join(', ') })}
            </Notice>
          )}

          {isForeignLocale && selected !== null && (
            <Notice tone="danger" title={t('menus.foreignLocaleTitle')}>
              {t('menus.foreignLocaleBody', {
                locale: selected.locale,
                locales: locales.join(', '),
              })}
            </Notice>
          )}

          <Card aria-labelledby="menu-items-heading">
            <CardHeader>
              <CardTitle>
                <h2 id="menu-items-heading">{t('menus.itemsHeading')}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody>
              {loading && <p>{t('common.loading')}</p>}
              {!loading && items.length === 0 && <p>{t('menus.empty')}</p>}
              {!loading && items.length > 0 && (
                <MenuTree
                  items={items}
                  disabled={!mayWrite || saving}
                  onReorder={(next) => void commitReorder(next)}
                  onEdit={setEditingItem}
                  onDelete={(item) => void removeItem(item)}
                />
              )}
            </CardBody>
          </Card>

          {mayWrite && (
            <Card aria-labelledby="new-menu-item-heading">
              <CardHeader>
                <CardTitle>
                  <h2 id="new-menu-item-heading">{t('menus.newItem')}</h2>
                </CardTitle>
              </CardHeader>
              <CardBody>
                <form
                  onSubmit={(event) => void submitNewItem(event)}
                  className="flex min-w-0 flex-col gap-3"
                  noValidate
                >
                  {itemError !== null && (
                    <Notice tone="danger" live="assertive">
                      <p>{itemError}</p>
                    </Notice>
                  )}
                  <Field className="min-w-0" label={t('menus.label')}>
                    {(control) => (
                      <Input
                        className="min-w-0"
                        {...control}
                        value={itemLabel}
                        required
                        onChange={(event) => setItemLabel(event.target.value)}
                      />
                    )}
                  </Field>

                  <div className="flex min-w-0 max-w-full flex-col gap-1.5">
                    <Label htmlFor="item-kind">{t('menus.kind')}</Label>
                    <Select
                      className="min-w-0 max-w-full"
                      id="item-kind"
                      value={itemKind}
                      onChange={(event) => setItemKind(event.target.value as MenuItemKind)}
                    >
                      <option value="url">{t('menus.kindUrl')}</option>
                      <option value="entry">{t('menus.kindEntry')}</option>
                      <option value="taxonomy">{t('menus.kindTaxonomy')}</option>
                      <option value="home">{t('menus.kindHome')}</option>
                      <option value="submenu-placeholder">{t('menus.kindSubmenu')}</option>
                    </Select>
                  </div>

                  {itemKind === 'url' && (
                    <Field className="min-w-0" label={t('menus.url')}>
                      {(control) => (
                        <Input
                          className="min-w-0"
                          {...control}
                          value={itemUrl}
                          required
                          onChange={(event) => setItemUrl(event.target.value)}
                        />
                      )}
                    </Field>
                  )}

                  {itemKind === 'entry' && token !== null && (
                    <>
                      <div className="flex min-w-0 max-w-full flex-col gap-1.5">
                        <Label htmlFor="item-collection">{t('menus.collection')}</Label>
                        <Select
                          className="min-w-0 max-w-full"
                          id="item-collection"
                          value={itemCollection}
                          onChange={(event) => {
                            setItemCollection(event.target.value)
                            setItemEntryId(null)
                          }}
                        >
                          {collections.map((collection) => (
                            <option key={collection.name} value={collection.name}>
                              {collection.labels.singular}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <MenuEntryPicker
                        token={token}
                        collection={itemCollection}
                        value={itemEntryId}
                        onChange={(id) => setItemEntryId(id)}
                      />
                    </>
                  )}

                  {itemKind === 'taxonomy' && token !== null && (
                    <>
                      <div className="flex min-w-0 max-w-full flex-col gap-1.5">
                        <Label htmlFor="item-taxonomy">{t('menus.taxonomy')}</Label>
                        <Select
                          className="min-w-0 max-w-full"
                          id="item-taxonomy"
                          value={itemTaxonomy}
                          onChange={(event) => {
                            setItemTaxonomy(event.target.value)
                            setItemTermId(null)
                          }}
                        >
                          {taxonomies.map((taxonomy) => (
                            <option key={taxonomy.name} value={taxonomy.name}>
                              {taxonomy.labels.singular['en'] ??
                                Object.values(taxonomy.labels.singular)[0] ??
                                taxonomy.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <MenuTermPicker
                        token={token}
                        taxonomy={itemTaxonomy}
                        value={itemTermId}
                        onChange={(id) => setItemTermId(id)}
                      />
                    </>
                  )}

                  <div className="flex min-w-0 max-w-full flex-col gap-1.5">
                    <Label htmlFor="item-parent">{t('menus.parent')}</Label>
                    <Select
                      className="min-w-0 max-w-full"
                      id="item-parent"
                      value={itemParent}
                      onChange={(event) => setItemParent(event.target.value)}
                    >
                      <option value="">{t('menus.noParent')}</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {`${'— '.repeat(item.depth)}${item.label}`}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <Button type="submit" disabled={creatingItem} className="self-start">
                    {t('menus.addItem')}
                  </Button>
                </form>
              </CardBody>
            </Card>
          )}
        </>
      )}

      <ConfirmDialog
        open={menuToDelete !== null}
        title={t('menus.deleteMenuTitle', { name: menuToDelete?.label ?? '' })}
        confirmLabel={t('menus.deleteMenu')}
        onCancel={() => setMenuToDelete(null)}
        onConfirm={() => {
          const target = menuToDelete
          setMenuToDelete(null)
          if (target !== null) void removeMenu(target)
        }}
      >
        <p>{t('menus.deleteMenuBody')}</p>
      </ConfirmDialog>

      {token !== null && (
        <ItemEditModal
          open={editingItem !== null}
          onOpenChange={(open) => {
            if (!open) setEditingItem(null)
          }}
          item={editingItem}
          items={items}
          token={token}
          collections={collections}
          taxonomies={taxonomies}
          onSaved={() => void loadItems()}
        />
      )}
    </section>
  )
}
