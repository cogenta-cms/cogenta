import { type FormEvent, type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  type MenuItem,
  type MenuItemKind,
  moveMenuItem,
  updateMenuItem,
} from '../api/menu-client.js'
import type { CollectionSummary, TaxonomySummary } from '../schema/types.js'
import { Button, Field, Input, Label, Modal, Select } from '../ui/index.js'
import { MenuEntryPicker } from './menu-entry-picker.js'
import { MenuTermPicker } from './menu-term-picker.js'
import { isSelfOrDescendant } from './menu-tree-ops.js'

/**
 * Corrects a menu item — label, type, target, presentation — without
 * recreating it (fiche 09, task 1: the previous editor's only path to
 * fixing a typo was delete-and-recreate, which lost the item's position and
 * every child under it).
 *
 * Changing `kind` is allowed and **zeroes the target** rather than keeping a
 * value that no longer means anything: an item switched from `entry` to
 * `url` must not silently keep a `targetEntryId` a `url` item has no use
 * for, and a later switch back to `entry` must not resurrect it either — the
 * whole point of "the change is authorised" is that the two shapes never
 * bleed into each other.
 *
 * A parent change is sent separately, through `moveMenuItem` — the API's own
 * `PATCH .../items/{id}` refuses to touch `parent` for exactly this reason
 * (see `menu-router.ts`), so this form issues that as its own call when the
 * parent selector actually changed.
 */
export function ItemEditModal({
  open,
  onOpenChange,
  item,
  items,
  token,
  collections,
  taxonomies,
  onSaved,
}: {
  readonly open: boolean
  onOpenChange(open: boolean): void
  readonly item: MenuItem | null
  readonly items: readonly MenuItem[]
  readonly token: string
  readonly collections: readonly CollectionSummary[]
  readonly taxonomies: readonly TaxonomySummary[]
  onSaved(): void
}): JSX.Element | null {
  const { t } = useTranslation()

  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<MenuItemKind>('url')
  const [url, setUrl] = useState('')
  const [targetCollection, setTargetCollection] = useState('')
  const [targetEntryId, setTargetEntryId] = useState<string | null>(null)
  const [targetEntryLabel, setTargetEntryLabel] = useState('')
  const [targetTaxonomy, setTargetTaxonomy] = useState('')
  const [targetTermId, setTargetTermId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [openInNewTab, setOpenInNewTab] = useState(false)
  const [parent, setParent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seeds the form every time a *different* item is opened — never mid-edit.
  useEffect(() => {
    if (item === null) return
    setLabel(item.label)
    setKind(item.kind)
    setUrl(item.url ?? '')
    setTargetCollection(item.targetCollection ?? collections[0]?.name ?? '')
    setTargetEntryId(item.targetEntryId)
    setTargetEntryLabel(item.resolvedLabel ?? item.targetEntryId ?? '')
    setTargetTaxonomy(item.targetTaxonomy ?? taxonomies[0]?.name ?? '')
    setTargetTermId(item.targetTermId)
    setTitle(item.title ?? '')
    setOpenInNewTab(item.openInNewTab)
    setParent(item.parent)
    setError(null)
  }, [item])

  if (item === null) return null

  const availableParents = items.filter(
    (candidate) => candidate.id !== item.id && !isSelfOrDescendant(items, candidate.id, item.id),
  )

  function changeKind(next: MenuItemKind): void {
    setKind(next)
    // Zeroes the target on every switch (the rule this modal exists to
    // enforce) — including switching *back* to the same kind, which is
    // indistinguishable from a fresh choice and should behave like one.
    setUrl('')
    setTargetEntryId(null)
    setTargetEntryLabel('')
    setTargetTermId(null)
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (item === null) return
    setSaving(true)
    setError(null)
    try {
      await updateMenuItem(token, item.menuId, item.id, {
        label,
        kind,
        url: kind === 'url' ? url : null,
        targetCollection: kind === 'entry' ? targetCollection : null,
        targetEntryId: kind === 'entry' ? targetEntryId : null,
        targetTaxonomy: kind === 'taxonomy' ? targetTaxonomy : null,
        targetTermId: kind === 'taxonomy' ? targetTermId : null,
        title: title === '' ? null : title,
        openInNewTab,
      })
      if (parent !== item.parent) {
        await moveMenuItem(token, item.menuId, item.id, parent)
      }
      onSaved()
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('menus.editItemError'))
    } finally {
      setSaving(false)
    }
  }

  const targetInvalid =
    (kind === 'url' && url.trim() === '') ||
    (kind === 'entry' && (targetCollection === '' || targetEntryId === null)) ||
    (kind === 'taxonomy' && (targetTaxonomy === '' || targetTermId === null))

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('menus.editItem')}
      closeLabel={t('menus.close')}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="menu-item-edit-form" disabled={saving || targetInvalid}>
            {t('menus.save')}
          </Button>
        </>
      }
    >
      <form
        id="menu-item-edit-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => void submit(event)}
      >
        {error !== null && <p role="alert">{error}</p>}

        <Field label={t('menus.label')}>
          {(control) => (
            <Input
              {...control}
              value={label}
              required
              onChange={(event) => setLabel(event.target.value)}
            />
          )}
        </Field>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-item-kind">{t('menus.kind')}</Label>
          <Select
            id="edit-item-kind"
            value={kind}
            onChange={(event) => changeKind(event.target.value as MenuItemKind)}
          >
            <option value="url">{t('menus.kindUrl')}</option>
            <option value="entry">{t('menus.kindEntry')}</option>
            <option value="taxonomy">{t('menus.kindTaxonomy')}</option>
            <option value="home">{t('menus.kindHome')}</option>
            <option value="submenu-placeholder">{t('menus.kindSubmenu')}</option>
          </Select>
        </div>

        {kind === 'url' && (
          <Field label={t('menus.url')}>
            {(control) => (
              <Input
                {...control}
                value={url}
                required
                onChange={(event) => setUrl(event.target.value)}
              />
            )}
          </Field>
        )}

        {kind === 'entry' && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-item-collection">{t('menus.collection')}</Label>
              <Select
                id="edit-item-collection"
                value={targetCollection}
                onChange={(event) => {
                  setTargetCollection(event.target.value)
                  setTargetEntryId(null)
                  setTargetEntryLabel('')
                }}
              >
                {collections.map((collection) => (
                  <option key={collection.name} value={collection.name}>
                    {collection.labels.singular}
                  </option>
                ))}
              </Select>
            </div>
            {targetEntryId !== null && (
              <p className="text-xs text-muted-foreground">
                {t('menus.currentTarget', { label: targetEntryLabel })}
              </p>
            )}
            <MenuEntryPicker
              token={token}
              collection={targetCollection}
              value={targetEntryId}
              onChange={(id, entryLabel) => {
                setTargetEntryId(id)
                setTargetEntryLabel(entryLabel)
              }}
            />
          </>
        )}

        {kind === 'taxonomy' && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-item-taxonomy">{t('menus.taxonomy')}</Label>
              <Select
                id="edit-item-taxonomy"
                value={targetTaxonomy}
                onChange={(event) => {
                  setTargetTaxonomy(event.target.value)
                  setTargetTermId(null)
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
              taxonomy={targetTaxonomy}
              value={targetTermId}
              onChange={(id) => setTargetTermId(id)}
            />
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-item-parent">{t('menus.parent')}</Label>
          <Select
            id="edit-item-parent"
            value={parent ?? ''}
            onChange={(event) => setParent(event.target.value === '' ? null : event.target.value)}
          >
            <option value="">{t('menus.noParent')}</option>
            {availableParents.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {`${'— '.repeat(candidate.depth)}${candidate.label}`}
              </option>
            ))}
          </Select>
        </div>

        <Field label={t('menus.itemTitle')} description={t('menus.itemTitleHint')}>
          {(control) => (
            <Input {...control} value={title} onChange={(event) => setTitle(event.target.value)} />
          )}
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={openInNewTab}
            onChange={(event) => setOpenInNewTab(event.target.checked)}
          />
          {t('menus.openInNewTab')}
        </label>
      </form>
    </Modal>
  )
}
