import { type FormEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
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
import { ItemEditModal } from '../menus/item-edit-modal.js'
import { MenuEntryPicker } from '../menus/menu-entry-picker.js'
import { MenuTermPicker } from '../menus/menu-term-picker.js'
import { MenuTree } from '../menus/menu-tree.js'
import { buildReorderPayload } from '../menus/menu-tree-ops.js'
import { useSchema } from '../schema/schema-context.js'
import { Button, Field, Input, Label, Notice, Select } from '../ui/index.js'

/**
 * Navigation menus: a named tree of links, edited entirely at runtime — a
 * menu is not declared in the site's schema the way a collection or a
 * taxonomy is, and it carries no version, no trash and no translation
 * family of its own (contract A's model, deliberately not grafted on here —
 * see `menu-store.ts`). Write controls only appear for an actor who may use
 * them; the server refuses the rest regardless (R4), so hiding a button here
 * is courtesy, not security.
 *
 * Locations a menu is offered here (`primary`, `footer`) are this stand-in
 * theme's own — a hint in the field, never a closed list: the location is a
 * free-text value the *menu* carries (fiche 09, task 3), so a future second
 * theme with different slot names needs no code change here either.
 */
const LOCATION_SUGGESTIONS = ['primary', 'footer']

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

  // New menu form.
  const [newName, setNewName] = useState('')
  const [newLocale, setNewLocale] = useState(locales[0] ?? 'en')
  const [newLabel, setNewLabel] = useState('')
  const [creatingMenu, setCreatingMenu] = useState(false)

  // Location (task 3).
  const [locationDraft, setLocationDraft] = useState('')
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
      setError(caught instanceof ApiError ? caught.message : t('menus.loadError'))
    }
  }, [token, t])

  useEffect(() => {
    void loadMenus()
  }, [loadMenus])

  useEffect(() => {
    if (selectedId === null && menus.length > 0) {
      const first = menus[0]
      if (first !== undefined) setSelectedId(first.id)
    }
  }, [menus, selectedId])

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
      setError(caught instanceof ApiError ? caught.message : t('menus.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, selectedId, t])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const selected = menus.find((menu) => menu.id === selectedId) ?? null

  useEffect(() => {
    setLocationDraft(selected?.location ?? '')
  }, [selected])

  async function submitNewMenu(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setCreatingMenu(true)
    setError(null)
    try {
      const menu = await createMenu(token, { name: newName, locale: newLocale, label: newLabel })
      setNewName('')
      setNewLabel('')
      await loadMenus()
      setSelectedId(menu.id)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('menus.createMenuError'))
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
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('menus.deleteMenuError'))
    }
  }

  async function saveLocation(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || selected === null) return
    setSavingLocation(true)
    setError(null)
    try {
      await updateMenu(token, selected.id, {
        location: locationDraft.trim() === '' ? null : locationDraft.trim(),
      })
      await loadMenus()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('menus.locationError'))
    } finally {
      setSavingLocation(false)
    }
  }

  async function submitNewItem(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || selectedId === null) return
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
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('menus.createItemError'))
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
      setError(caught instanceof ApiError ? caught.message : t('menus.deleteItemError'))
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
      setError(caught instanceof ApiError ? caught.message : t('menus.reorderError'))
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
      setError(caught instanceof ApiError ? caught.message : t('menus.duplicateError'))
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

  // A rendered-as-published preview (task 5): the same "hide a dead link,
  // never serve one" rule `theme-render.ts`'s `renderMenuLinks` applies —
  // reimplemented at this one small scale rather than pulled in as a
  // dependency, since there is no navigation block in contract B for
  // `POST /api/builder/render` to render. Not the live theme: a plain list
  // that shows exactly what a visitor would and wouldn't see.
  const previewItems = useMemo(
    () =>
      items.filter((item) => {
        if (item.kind === 'submenu-placeholder') return true
        if (item.kind === 'url') return item.url !== null && item.url !== ''
        return item.resolvedRoute !== undefined && item.resolvedRoute !== null
      }),
    [items],
  )

  if (schemaState.status === 'loading') return <p>{t('common.loading')}</p>
  if (schemaState.status === 'error') {
    return <p role="alert">{t('common.schemaError', { message: schemaState.message })}</p>
  }

  return (
    <section aria-labelledby="menus-heading" className="flex flex-col gap-4">
      <h1 id="menus-heading">{t('menus.heading')}</h1>
      {error !== null && <p role="alert">{error}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="menu-select">{t('menus.menu')}</Label>
          <Select
            id="menu-select"
            value={selectedId ?? ''}
            onChange={(event) =>
              setSelectedId(event.target.value === '' ? null : event.target.value)
            }
          >
            <option value="">{t('menus.none')}</option>
            {menus.map((menu) => (
              <option key={menu.id} value={menu.id}>
                {menu.label} ({menu.locale}
                {menu.location !== null ? `, ${menu.location}` : ''})
              </option>
            ))}
          </Select>
        </div>
        {mayWrite && selected !== null && (
          <Button type="button" variant="destructive" onClick={() => void removeMenu(selected)}>
            {t('menus.deleteMenu')}
          </Button>
        )}
      </div>

      {mayWrite && (
        <form
          onSubmit={(event) => void submitNewMenu(event)}
          className="flex flex-wrap items-end gap-2"
        >
          <h2 className="w-full text-base font-semibold">{t('menus.newMenu')}</h2>
          <Field label={t('menus.name')}>
            {(control) => (
              <Input
                {...control}
                value={newName}
                required
                onChange={(event) => setNewName(event.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="menu-locale">{t('menus.locale')}</Label>
            <Select
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
          <Field label={t('menus.label')}>
            {(control) => (
              <Input
                {...control}
                value={newLabel}
                required
                onChange={(event) => setNewLabel(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" disabled={creatingMenu}>
            {t('menus.create')}
          </Button>
        </form>
      )}

      {selected !== null && (
        <>
          {mayWrite && (
            <form
              onSubmit={(event) => void saveLocation(event)}
              className="flex flex-wrap items-end gap-2"
            >
              <Field label={t('menus.location')} description={t('menus.locationHint')}>
                {(control) => (
                  <Input
                    {...control}
                    list="menu-location-suggestions"
                    value={locationDraft}
                    onChange={(event) => setLocationDraft(event.target.value)}
                  />
                )}
              </Field>
              <datalist id="menu-location-suggestions">
                {LOCATION_SUGGESTIONS.map((location) => (
                  <option key={location} value={location} />
                ))}
              </datalist>
              <Button type="submit" variant="secondary" disabled={savingLocation}>
                {t('menus.saveLocation')}
              </Button>
            </form>
          )}

          {problemCount > 0 && (
            <Notice tone="warning" title={t('menus.problemsTitle', { count: problemCount })}>
              {t('menus.problemsBody')}
            </Notice>
          )}

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

          {items.length > 0 && (
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">{t('menus.previewTitle')}</h2>
              {previewItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('menus.previewEmpty')}</p>
              ) : (
                <nav aria-label={t('menus.previewTitle')}>
                  <ul className="m-0 flex flex-col gap-1 p-0">
                    {previewItems.map((item) => (
                      <li
                        key={item.id}
                        className="list-none"
                        style={{ marginLeft: `${item.depth * 1.5}rem` }}
                      >
                        {item.kind === 'submenu-placeholder' ? (
                          <span>{item.label}</span>
                        ) : (
                          <a
                            href={
                              item.kind === 'url' ? (item.url ?? '#') : (item.resolvedRoute ?? '#')
                            }
                          >
                            {item.label}
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </div>
          )}

          {mayWrite && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="duplicate-locale">{t('menus.duplicateTo')}</Label>
                <Select
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

          {mayWrite && (
            <form onSubmit={(event) => void submitNewItem(event)} className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">{t('menus.newItem')}</h2>
              <Field label={t('menus.label')}>
                {(control) => (
                  <Input
                    {...control}
                    value={itemLabel}
                    required
                    onChange={(event) => setItemLabel(event.target.value)}
                  />
                )}
              </Field>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-kind">{t('menus.kind')}</Label>
                <Select
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
                <Field label={t('menus.url')}>
                  {(control) => (
                    <Input
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
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-collection">{t('menus.collection')}</Label>
                    <Select
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
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="item-taxonomy">{t('menus.taxonomy')}</Label>
                    <Select
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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-parent">{t('menus.parent')}</Label>
                <Select
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
          )}
        </>
      )}

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
