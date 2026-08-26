import { type ChangeEvent, type JSX, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContentBlock } from '../api/content-client.js'
import { ApiError } from '../api/http.js'
import { createPattern, deletePattern, listPatterns, type Pattern } from '../api/patterns-client.js'
import { Button, Field, Input, Modal, Notice, Select } from '../ui/index.js'
import { blocksOfKeys } from './block-moves.js'
import { exportPatternFile, parsePatternFile } from './patterns.js'

/**
 * The motif/model library panel (fiche 43 sub-chantier A; fiche 05 task 1),
 * beside `BlockPicker` in the builder's insertion column.
 *
 * Two kinds share one table (`@cogenta/schema`'s `PatternStore`) and one
 * screen here: a **motif** is a handful of blocks added to whatever the page
 * already has; a **modèle de page complet** replaces the whole zone, and
 * only ever after `Modal` confirmation — never silently (fiche 43 §5's own
 * acceptance criterion). Inserting either is delegated to the caller
 * (`PageBuilder`), which alone owns the block list and its undo history;
 * this component only ever hands back a `Pattern`.
 *
 * Admin/editor only, matching `pattern-router.ts`'s fixed door: a lesser
 * role that can still edit this entry's blocks (`update` on the collection)
 * sees the panel degrade to "unavailable" rather than a scary error banner
 * — the same shape `assist`'s own panel uses when its capability is absent.
 */
export function PatternPicker({
  token,
  disabled = false,
  blocks,
  selectedKeys,
  onInsertPattern,
  onApplyTemplate,
}: {
  readonly token: string
  readonly disabled?: boolean
  /** The zone's current blocks — what "save whole page as a template" captures. */
  readonly blocks: readonly ContentBlock[]
  /** The multi-selection (fiche 43 sub-chantier E) — what "save selection as a pattern" captures. */
  readonly selectedKeys: ReadonlySet<string>
  onInsertPattern(pattern: Pattern): void
  onApplyTemplate(pattern: Pattern): void
}): JSX.Element | null {
  const { t } = useTranslation()
  const importInput = useRef<HTMLInputElement | null>(null)

  const [patterns, setPatterns] = useState<readonly Pattern[]>([])
  const [templates, setTemplates] = useState<readonly Pattern[]>([])
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingTemplate, setPendingTemplate] = useState<Pattern | null>(null)

  const [saveName, setSaveName] = useState('')
  const [saveCategory, setSaveCategory] = useState('')
  const [saveKind, setSaveKind] = useState<'pattern' | 'template'>('pattern')
  const [saving, setSaving] = useState(false)

  async function reload(): Promise<void> {
    try {
      const [nextPatterns, nextTemplates] = await Promise.all([
        listPatterns(token, 'pattern'),
        listPatterns(token, 'template'),
      ])
      setPatterns(nextPatterns)
      setTemplates(nextTemplates)
      setAvailable(true)
      setError(null)
    } catch (caught) {
      // A 403 means this actor is not admin/editor — a quiet degradation,
      // not an error: the rest of the builder still works.
      if (caught instanceof ApiError && caught.code === 'FORBIDDEN') {
        setAvailable(false)
        return
      }
      setError(caught instanceof ApiError ? caught.message : t('builder.patterns.loadError'))
    }
  }

  useEffect(() => {
    void reload()
    // Only on mount and when the token changes — every mutation below
    // reloads explicitly after it lands, which is what keeps the list from
    // refetching on every keystroke of the save form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (!available) {
    return <p className="text-sm text-muted-foreground">{t('builder.patterns.unavailable')}</p>
  }

  async function handleSave(): Promise<void> {
    if (saving) return
    const captured = saveKind === 'template' ? blocks : blocksOfKeys(blocks, selectedKeys)
    if (captured.length === 0) return
    setSaving(true)
    setError(null)
    try {
      await createPattern(token, {
        name: saveName,
        category: saveCategory.trim() === '' ? null : saveCategory.trim(),
        kind: saveKind,
        blocks: captured,
      })
      setSaveName('')
      setSaveCategory('')
      await reload()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('builder.patterns.saveError'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setError(null)
    try {
      await deletePattern(token, id)
      await reload()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('builder.patterns.deleteError'))
    }
  }

  function handleExport(): void {
    const file = exportPatternFile([...patterns, ...templates])
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cogenta-patterns.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) return
    setError(null)
    const text = await file.text()
    const parsed = parsePatternFile(text)
    if (!parsed.ok) {
      setError(
        parsed.reason === 'unknown-block-type'
          ? t('builder.patterns.importUnknownType', { type: parsed.type })
          : t('builder.patterns.importInvalid'),
      )
      return
    }
    try {
      // Every block's type was already checked against this site's
      // vocabulary by `parsePatternFile` above — an entry that reached here
      // is already known-good, so this loop only ever writes.
      for (const entry of parsed.entries) {
        await createPattern(token, {
          name: entry.name,
          category: entry.category,
          kind: entry.kind,
          blocks: entry.blocks,
          provenance: entry.provenance,
          provenanceDetail: entry.provenanceDetail,
        })
      }
      await reload()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('builder.patterns.importInvalid'))
    }
  }

  const canSaveSelection = selectedKeys.size > 0
  const canSaveTemplate = blocks.length > 0

  return (
    <div className="flex flex-col gap-4">
      {error !== null && <Notice tone="danger">{error}</Notice>}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          {t('builder.patterns.savedHeading')}
        </p>
        {patterns.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('builder.patterns.patternsEmpty')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {patterns.map((pattern) => (
              <li
                key={pattern.id}
                className="flex items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2"
              >
                <span className="text-sm">
                  {pattern.name}
                  {pattern.category !== null && (
                    <span className="ml-1 text-xs text-muted-foreground">({pattern.category})</span>
                  )}
                </span>
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => onInsertPattern(pattern)}
                  >
                    {t('builder.patterns.insert')}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={t('builder.patterns.deleteLabel', { name: pattern.name })}
                    onClick={() => void handleDelete(pattern.id)}
                  >
                    ✕
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          {t('builder.patterns.templatesHeading')}
        </p>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('builder.patterns.templatesEmpty')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {templates.map((pattern) => (
              <li
                key={pattern.id}
                className="flex items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2"
              >
                <span className="text-sm">
                  {pattern.name}
                  {pattern.category !== null && (
                    <span className="ml-1 text-xs text-muted-foreground">({pattern.category})</span>
                  )}
                </span>
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => setPendingTemplate(pattern)}
                  >
                    {t('builder.patterns.applyTemplate')}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={t('builder.patterns.deleteLabel', { name: pattern.name })}
                    onClick={() => void handleDelete(pattern.id)}
                  >
                    ✕
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-dashed border-input p-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          {t('builder.patterns.saveHeading')}
        </p>
        <Field label={t('builder.patterns.nameLabel')}>
          {(control) => (
            <Input
              {...control}
              value={saveName}
              disabled={disabled}
              onChange={(event) => setSaveName(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('builder.patterns.categoryLabel')}>
          {(control) => (
            <Input
              {...control}
              value={saveCategory}
              disabled={disabled}
              onChange={(event) => setSaveCategory(event.target.value)}
            />
          )}
        </Field>
        <Field label={t('builder.patterns.kindLabel')}>
          {(control) => (
            <Select
              {...control}
              value={saveKind}
              disabled={disabled}
              onChange={(event) => setSaveKind(event.target.value as 'pattern' | 'template')}
            >
              <option value="pattern">{t('builder.patterns.kindPattern')}</option>
              <option value="template">{t('builder.patterns.kindTemplate')}</option>
            </Select>
          )}
        </Field>
        <p className="text-xs text-muted-foreground">
          {saveKind === 'pattern'
            ? t('builder.patterns.saveHintPattern')
            : t('builder.patterns.saveHintTemplate')}
        </p>
        <Button
          size="sm"
          disabled={
            disabled ||
            saving ||
            saveName.trim() === '' ||
            (saveKind === 'pattern' ? !canSaveSelection : !canSaveTemplate)
          }
          onClick={() => void handleSave()}
        >
          {t('builder.patterns.saveButton')}
        </Button>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="ghost" disabled={disabled} onClick={handleExport}>
          {t('builder.patterns.exportButton')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => importInput.current?.click()}
        >
          {t('builder.patterns.importButton')}
        </Button>
        <input
          ref={importInput}
          type="file"
          accept="application/json"
          aria-label={t('builder.patterns.importButton')}
          className="sr-only"
          onChange={(event) => void handleImport(event)}
        />
      </div>

      <Modal
        open={pendingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTemplate(null)
        }}
        title={t('builder.patterns.confirmTemplateTitle')}
        closeLabel={t('common.cancel')}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setPendingTemplate(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (pendingTemplate !== null) onApplyTemplate(pendingTemplate)
                setPendingTemplate(null)
              }}
            >
              {t('builder.patterns.confirmTemplateApply')}
            </Button>
          </>
        }
      >
        <p>{t('builder.patterns.confirmTemplateBody')}</p>
      </Modal>
    </div>
  )
}
