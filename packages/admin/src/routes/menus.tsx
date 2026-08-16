import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { type Entry, listEntries } from '../api/content-client.js'
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
  reorderMenuItem,
} from '../api/menu-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useSchema } from '../schema/schema-context.js'

/**
 * Navigation menus: a named tree of links, edited entirely at runtime — a
 * menu is not declared in the site's schema the way a collection or a
 * taxonomy is.
 *
 * Kept plain, the same way `taxonomies.tsx` is: L11 owns how the admin looks,
 * what matters here is that every action goes through the real API and that
 * write controls only appear for an actor who may use them. The server
 * refuses the rest regardless (R4); hiding a button here is courtesy, not
 * security.
 */
export function MenusRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const mayWrite = roles.includes('admin') || roles.includes('editor')

  const collections = schemaState.status === 'ready' ? schemaState.schema.collections : []
  const locales =
    schemaState.status === 'ready'
      ? (schemaState.schema.site?.locales ?? [i18n.language])
      : [i18n.language]

  const [menus, setMenus] = useState<readonly Menu[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<readonly MenuItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New menu form.
  const [newName, setNewName] = useState('')
  const [newLocale, setNewLocale] = useState(locales[0] ?? 'en')
  const [newLabel, setNewLabel] = useState('')
  const [creatingMenu, setCreatingMenu] = useState(false)

  // New item form.
  const [itemKind, setItemKind] = useState<MenuItemKind>('url')
  const [itemLabel, setItemLabel] = useState('')
  const [itemUrl, setItemUrl] = useState('')
  const [itemCollection, setItemCollection] = useState(collections[0]?.name ?? '')
  const [itemEntryId, setItemEntryId] = useState('')
  const [itemParent, setItemParent] = useState('')
  const [entries, setEntries] = useState<readonly Entry[]>([])
  const [creatingItem, setCreatingItem] = useState(false)

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

  useEffect(() => {
    if (token === null || itemKind !== 'entry' || itemCollection === '') {
      setEntries([])
      return
    }
    void listEntries(token, itemCollection, { limit: 100 })
      .then((page) => setEntries(page.items))
      .catch(() => setEntries([]))
  }, [token, itemKind, itemCollection])

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
      })
      setItemLabel('')
      setItemUrl('')
      setItemEntryId('')
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

  async function move(item: MenuItem, direction: 'up' | 'down'): Promise<void> {
    if (token === null || selectedId === null) return
    setError(null)
    try {
      await reorderMenuItem(token, selectedId, item.id, direction)
      await loadItems()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('menus.reorderError'))
    }
  }

  if (schemaState.status === 'loading') return <p>{t('common.loading')}</p>
  if (schemaState.status === 'error') {
    return <p role="alert">{t('common.schemaError', { message: schemaState.message })}</p>
  }

  const selected = menus.find((menu) => menu.id === selectedId) ?? null

  return (
    <section aria-labelledby="menus-heading">
      <h1 id="menus-heading">{t('menus.heading')}</h1>
      {error !== null && <p role="alert">{error}</p>}
      <label htmlFor="menu-select">{t('menus.menu')}</label>{' '}
      <select
        id="menu-select"
        value={selectedId ?? ''}
        onChange={(event) => setSelectedId(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">{t('menus.none')}</option>
        {menus.map((menu) => (
          <option key={menu.id} value={menu.id}>
            {menu.label} ({menu.locale})
          </option>
        ))}
      </select>
      {mayWrite && selected !== null && (
        <button type="button" onClick={() => void removeMenu(selected)}>
          {t('menus.deleteMenu')}
        </button>
      )}
      {mayWrite && (
        <form onSubmit={(event) => void submitNewMenu(event)}>
          <h2>{t('menus.newMenu')}</h2>
          <label htmlFor="menu-name">{t('menus.name')}</label>{' '}
          <input
            id="menu-name"
            value={newName}
            required
            onChange={(event) => setNewName(event.target.value)}
          />
          <label htmlFor="menu-locale">{t('menus.locale')}</label>{' '}
          <select
            id="menu-locale"
            value={newLocale}
            onChange={(event) => setNewLocale(event.target.value)}
          >
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {locale}
              </option>
            ))}
          </select>
          <label htmlFor="menu-label">{t('menus.label')}</label>{' '}
          <input
            id="menu-label"
            value={newLabel}
            required
            onChange={(event) => setNewLabel(event.target.value)}
          />
          <button type="submit" disabled={creatingMenu}>
            {t('menus.create')}
          </button>
        </form>
      )}
      {selected !== null && (
        <>
          {loading && <p>{t('common.loading')}</p>}
          {!loading && items.length === 0 && <p>{t('menus.empty')}</p>}
          {items.length > 0 && (
            <table>
              <caption>{t('menus.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('menus.item')}</th>
                  <th scope="col">{t('menus.target')}</th>
                  {mayWrite && <th scope="col">{t('menus.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ paddingLeft: `${item.depth * 1.5}rem` }}>{item.label}</td>
                    <td>{targetOf(item)}</td>
                    {mayWrite && (
                      <td>
                        <button type="button" onClick={() => void move(item, 'up')}>
                          {t('menus.moveUp')}
                        </button>
                        <button type="button" onClick={() => void move(item, 'down')}>
                          {t('menus.moveDown')}
                        </button>
                        <button type="button" onClick={() => void removeItem(item)}>
                          {t('menus.delete')}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {mayWrite && (
            <form onSubmit={(event) => void submitNewItem(event)}>
              <h2>{t('menus.newItem')}</h2>
              <label htmlFor="item-label">{t('menus.label')}</label>{' '}
              <input
                id="item-label"
                value={itemLabel}
                required
                onChange={(event) => setItemLabel(event.target.value)}
              />
              <label htmlFor="item-kind">{t('menus.kind')}</label>{' '}
              <select
                id="item-kind"
                value={itemKind}
                onChange={(event) => setItemKind(event.target.value as MenuItemKind)}
              >
                <option value="url">{t('menus.kindUrl')}</option>
                <option value="entry">{t('menus.kindEntry')}</option>
                <option value="submenu-placeholder">{t('menus.kindSubmenu')}</option>
              </select>
              {itemKind === 'url' && (
                <>
                  <label htmlFor="item-url">{t('menus.url')}</label>{' '}
                  <input
                    id="item-url"
                    value={itemUrl}
                    required
                    onChange={(event) => setItemUrl(event.target.value)}
                  />
                </>
              )}
              {itemKind === 'entry' && (
                <>
                  <label htmlFor="item-collection">{t('menus.collection')}</label>{' '}
                  <select
                    id="item-collection"
                    value={itemCollection}
                    onChange={(event) => setItemCollection(event.target.value)}
                  >
                    {collections.map((collection) => (
                      <option key={collection.name} value={collection.name}>
                        {collection.labels.singular}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="item-entry">{t('menus.entry')}</label>{' '}
                  <select
                    id="item-entry"
                    value={itemEntryId}
                    required
                    onChange={(event) => setItemEntryId(event.target.value)}
                  >
                    <option value="">{t('menus.selectEntry')}</option>
                    {entries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entryLabel(entry)}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <label htmlFor="item-parent">{t('menus.parent')}</label>{' '}
              <select
                id="item-parent"
                value={itemParent}
                onChange={(event) => setItemParent(event.target.value)}
              >
                <option value="">{t('menus.noParent')}</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button type="submit" disabled={creatingItem}>
                {t('menus.addItem')}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  )
}

function targetOf(item: MenuItem): string {
  if (item.kind === 'url') return item.url ?? ''
  if (item.kind === 'entry')
    return item.resolvedRoute ?? item.resolvedLabel ?? item.targetEntryId ?? ''
  return ''
}

function entryLabel(entry: Entry): string {
  const title = entry.values['title']
  const name = entry.values['name']
  if (typeof title === 'string' && title.length > 0) return title
  if (typeof name === 'string' && name.length > 0) return name
  return entry.id
}
