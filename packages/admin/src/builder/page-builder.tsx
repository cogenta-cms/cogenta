import type { BlockVariant } from '@cogenta/blocks'
import { type JSX, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { renderDraft } from '../api/builder-client.js'
import { ApiError } from '../api/client.js'
import type { ContentBlock } from '../api/content-client.js'
import type { Pattern } from '../api/patterns-client.js'
import { BlockForm } from '../blocks/block-form.js'
import { blockDefinition } from '../blocks/vocabulary.js'
import { cn } from '../ui/cn.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'
import {
  insertBlock,
  moveBlock,
  moveSelectionDown,
  moveSelectionUp,
  parseClipboardBlocks,
  pasteBlocks,
  removeBlock,
  removeBlocks,
  serialiseBlocksForClipboard,
  setInlineText,
  updateBlockData,
} from './block-moves.js'
import { BlockOutline } from './block-outline.js'
import { BlockPicker } from './block-picker.js'
import { BlockVariantControl } from './block-variant.js'
import type { History } from './history.js'
import { canRedo, canUndo, createHistory, push, redo, reset, undo } from './history.js'
import { PatternPicker } from './pattern-picker.js'
import { applyTemplateBlocks, insertPatternBlocks } from './patterns.js'
import { PreviewFrame } from './preview-frame.js'
import type { Viewport } from './viewports.js'
import { VIEWPORTS } from './viewports.js'

/**
 * The visual page builder (L16, extended by fiche 05 and fiche 43
 * sub-chantiers A/B/E/F).
 *
 * What it is *not* is as important as what it is: there is no React copy of
 * the twelve blocks anywhere in this admin. The middle of the screen is an
 * iframe holding the HTML `cogenta serve` really renders for this page, and
 * every action here is an edit to the block list followed by asking the server
 * to render it again. That is the whole of task 1's decision — a builder that
 * cannot diverge from the published page because it is not a second renderer.
 *
 * The cost is honest and visible: a change is visible after a round trip, not
 * in the same frame. It is debounced so that typing does not queue a render
 * per keystroke, and the preview keeps showing the last good render while the
 * next one is in flight rather than blanking.
 *
 * The detail panel is the existing `BlockForm` — the same schema-driven form
 * the field editor uses. The builder handles what a form cannot (where a block
 * sits, and text edited in the page itself); the form handles what a preview
 * cannot (a media reference, a list of items, a rich-text document).
 */

/** Long enough that a held key does not queue a render per character. */
const PREVIEW_DEBOUNCE_MS = 300

/** Whether a keyboard shortcut should fall through to normal text editing instead of acting on the block selection. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function PageBuilder({
  token,
  collection,
  entryId,
  zone,
  blocks,
  onBlocksChange,
  disabled = false,
}: {
  readonly token: string
  readonly collection: string
  readonly entryId: string
  /** The name of the `blocks` field being composed. */
  readonly zone: string
  readonly blocks: readonly ContentBlock[]
  onBlocksChange(blocks: readonly ContentBlock[]): void
  readonly disabled?: boolean
}): JSX.Element {
  const { t } = useTranslation()

  const [history, setHistory] = useState<History<readonly ContentBlock[]>>(() =>
    createHistory(blocks),
  )
  /**
   * The group selection (fiche 43 sub-chantier E): a plain click in the
   * outline or the preview replaces it with one key; `Shift`+click in the
   * outline toggles a key into or out of it. The detail panel below only
   * ever shows a form when this names exactly one block — the same
   * "selecting several hides the single-block editor" rule Gutenberg uses,
   * since a `BlockForm` has no way to edit two different blocks' fields at
   * once.
   */
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(new Set())
  /**
   * Locked blocks (fiche 43 sub-chantier E) — admin-only, session-only: a
   * flag this component keeps for the length of one editing session, never
   * written to contract B or the server. It protects a composed header or
   * footer from an accidental drag or delete; it is not a persisted
   * property of the block, so it resets the next time this entry is opened.
   */
  const [lockedKeys, setLockedKeys] = useState<ReadonlySet<string>>(new Set())
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [chromeVisible, setChromeVisible] = useState(true)
  const [html, setHtml] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null)

  /**
   * The last list this component handed upward.
   *
   * Without it there is no way to tell "the parent is echoing back the edit I
   * just made" from "the entry was reloaded, or a version was restored" — and
   * the two need opposite treatment, since only the second must clear the
   * undo stack.
   */
  const emitted = useRef<readonly ContentBlock[] | null>(null)

  useEffect(() => {
    if (blocks === emitted.current) return
    setHistory(reset(blocks))
    setSelectedKeys(new Set())
  }, [blocks])

  const present = history.present

  function commit(next: readonly ContentBlock[]): void {
    if (next === present) return
    emitted.current = next
    setHistory((current) => push(current, next))
    onBlocksChange(next)
  }

  function step(
    compute: (h: History<readonly ContentBlock[]>) => History<readonly ContentBlock[]>,
  ) {
    setHistory((current) => {
      const next = compute(current)
      if (next === current) return current
      emitted.current = next.present
      onBlocksChange(next.present)
      return next
    })
  }

  // One render per settled edit. The previous request is abandoned rather than
  // cancelled — an abandoned response is discarded on arrival, which is enough
  // to stop an older render overwriting a newer one.
  useEffect(() => {
    let abandoned = false
    const timer = setTimeout(() => {
      setRendering(true)
      renderDraft(token, collection, entryId, { [zone]: present })
        .then((result) => {
          if (abandoned) return
          setHtml(result.html)
          setError(null)
        })
        .catch((caught: unknown) => {
          if (abandoned) return
          setError(caught instanceof ApiError ? caught.message : t('builder.previewError'))
        })
        .finally(() => {
          if (!abandoned) setRendering(false)
        })
    }, PREVIEW_DEBOUNCE_MS)
    return () => {
      abandoned = true
      clearTimeout(timer)
    }
  }, [token, collection, entryId, zone, present, t])

  /** Every selected key that is not locked — what a group move/remove/copy actually operates on. */
  function movableSelection(): ReadonlySet<string> {
    if (lockedKeys.size === 0) return selectedKeys
    const movable = new Set<string>()
    for (const key of selectedKeys) if (!lockedKeys.has(key)) movable.add(key)
    return movable
  }

  /**
   * A locked block must stay exactly where it is — not merely "never move on
   * its own", or a neighbour's ordinary move (a row button, a drag) would
   * push it aside as a side effect. `moveBlock` reshuffles every block
   * between the old and new position (a splice, not a pairwise swap), so
   * the guard checks that whole range rather than just the two endpoints.
   */
  function handleMove(key: string, toIndex: number): void {
    if (disabled || lockedKeys.has(key)) return
    if (lockedKeys.size > 0) {
      const from = present.findIndex((block) => block.key === key)
      if (from === -1) return
      const clampedTo = Math.max(0, Math.min(toIndex, present.length - 1))
      const [lo, hi] = from <= clampedTo ? [from, clampedTo] : [clampedTo, from]
      for (let i = lo; i <= hi; i += 1) {
        const candidate = present[i]
        if (candidate !== undefined && candidate.key !== key && lockedKeys.has(candidate.key)) {
          return
        }
      }
    }
    commit(moveBlock(present, key, toIndex))
  }

  function handleInsert(type: string, atIndex: number): void {
    if (disabled) return
    const inserted = insertBlock(present, type, atIndex)
    if (inserted.key === null) return
    commit(inserted.blocks)
    setSelectedKeys(new Set([inserted.key]))
  }

  function handleRemove(key: string): void {
    if (disabled || lockedKeys.has(key)) return
    commit(removeBlock(present, key))
    if (selectedKeys.has(key)) {
      const next = new Set(selectedKeys)
      next.delete(key)
      setSelectedKeys(next)
    }
  }

  function handleInlineEdit(key: string, field: string, text: string): void {
    if (disabled) return
    // `setInlineText` refuses anything that is not a declared plain-text field
    // of that block, so a `data-field` the theme grows later cannot silently
    // overwrite a structured value.
    commit(setInlineText(present, key, field, text))
  }

  // ---- Selection (fiche 43 sub-chantier E) ---------------------------------

  /** A plain click in the outline: replaces the selection with one block. */
  function handleOutlineSelect(key: string, additive: boolean): void {
    if (!additive) {
      setSelectedKeys(new Set([key]))
      return
    }
    const next = new Set(selectedKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedKeys(next)
  }

  /**
   * `variant` (RFC 0002) lives inside `data`, exactly like any of a block's
   * own schema fields — there is no separate envelope slot for it on the
   * wire (`ContentBlock` is `{key, type, data}`), so `updateBlockData` is
   * genuinely the only mechanism needed here, per the RFC's own decision.
   * `undefined` deletes the key entirely rather than storing an explicit
   * `variant: undefined`, so a block nobody ever touched here still writes
   * byte-for-byte the same `data` it always did.
   */
  function handleVariantChange(
    key: string,
    block: ContentBlock,
    variant: BlockVariant | undefined,
  ): void {
    if (disabled) return
    if (variant === undefined) {
      const { variant: _dropped, ...rest } = block.data
      commit(updateBlockData(present, key, rest))
      return
    }
    commit(updateBlockData(present, key, { ...block.data, variant }))
  }

  /** A click in the preview: always a plain (non-additive) selection — multi-select is scoped to the outline list. */
  function handlePreviewSelect(key: string): void {
    setSelectedKeys(new Set([key]))
  }

  function handleToggleLock(key: string): void {
    if (disabled) return
    const next = new Set(lockedKeys)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setLockedKeys(next)
  }

  function handleMoveSelectionUp(): void {
    if (disabled) return
    commit(moveSelectionUp(present, movableSelection(), lockedKeys))
  }

  function handleMoveSelectionDown(): void {
    if (disabled) return
    commit(moveSelectionDown(present, movableSelection(), lockedKeys))
  }

  function handleRemoveSelection(): void {
    if (disabled) return
    const movable = movableSelection()
    commit(removeBlocks(present, movable))
    const remaining = new Set(selectedKeys)
    for (const key of movable) remaining.delete(key)
    setSelectedKeys(remaining)
  }

  // ---- Copy / paste (fiche 05 task 2, fiche 43 sub-chantier B) ------------

  async function copySelection(): Promise<void> {
    const toCopy = present.filter((block) => selectedKeys.has(block.key))
    if (toCopy.length === 0) return
    try {
      await navigator.clipboard.writeText(serialiseBlocksForClipboard(toCopy))
      setClipboardNotice(t('builder.copiedNotice', { count: toCopy.length }))
    } catch {
      setClipboardNotice(t('builder.clipboardUnavailable'))
    }
  }

  async function pasteFromClipboard(): Promise<void> {
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      setClipboardNotice(t('builder.clipboardUnavailable'))
      return
    }
    const result = parseClipboardBlocks(text)
    if (result.kind === 'not-ours') return
    if (result.kind === 'unknown-type') {
      setClipboardNotice(t('builder.pasteUnknownType', { type: result.type }))
      return
    }
    if (disabled) return
    commit(pasteBlocks(present, result.blocks, present.length))
    setClipboardNotice(null)
  }

  /** `Ctrl/⌘+Z`/`Ctrl/⌘+Shift+Z` (undo/redo), `Ctrl/⌘+C`/`Ctrl/⌘+V` (copy/paste the selection) — every shortcut an editor already knows from any other document tool. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()

    if (key === 'z') {
      event.preventDefault()
      step(event.shiftKey ? redo : undo)
      return
    }

    // Copy/paste must not steal the shortcut from an ordinary text field —
    // the search box, a `BlockForm` input — where the same keys mean "copy
    // this text", not "copy this block".
    if (isEditableTarget(event.target)) return

    if (key === 'c' && selectedKeys.size > 0) {
      event.preventDefault()
      void copySelection()
      return
    }
    if (key === 'v') {
      event.preventDefault()
      void pasteFromClipboard()
    }
  }

  function handleInsertPattern(pattern: Pattern): void {
    if (disabled) return
    const inserted = insertPatternBlocks(present, pattern, present.length)
    commit(inserted.blocks)
    setSelectedKeys(new Set(inserted.keys))
  }

  /**
   * Applying a full-page template: `PatternPicker` has already asked for
   * explicit confirmation (its own `Modal`) before this is ever called —
   * this function itself has no notion of "are you sure", on purpose, so
   * there is exactly one place in the whole feature that can silently skip
   * it.
   */
  function handleApplyTemplate(pattern: Pattern): void {
    if (disabled) return
    commit(applyTemplateBlocks(pattern))
    setSelectedKeys(new Set())
  }

  const singleSelected = selectedKeys.size === 1 ? ([...selectedKeys][0] ?? null) : null
  const selected = present.find((block) => block.key === singleSelected) ?? null
  const selectedDefinition = selected === null ? undefined : blockDefinition(selected.type)

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the shortcut is a convenience over controls that all exist as real buttons below.
    <div className="flex flex-col gap-4" onKeyDown={handleKeyDown}>
      <div className="flex flex-wrap items-center gap-2">
        <fieldset className="m-0 flex gap-1 border-0 p-0" aria-label={t('builder.historyLabel')}>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || !canUndo(history)}
            onClick={() => step(undo)}
          >
            {t('builder.undo')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || !canRedo(history)}
            onClick={() => step(redo)}
          >
            {t('builder.redo')}
          </Button>
        </fieldset>

        <fieldset className="m-0 flex gap-1 border-0 p-0" aria-label={t('builder.viewportLabel')}>
          {VIEWPORTS.map((name) => (
            <Button
              key={name}
              size="sm"
              variant={viewport === name ? 'primary' : 'ghost'}
              aria-pressed={viewport === name}
              onClick={() => setViewport(name)}
            >
              {t(`builder.viewport.${name}`)}
            </Button>
          ))}
        </fieldset>

        <Button
          size="sm"
          variant="ghost"
          aria-pressed={!chromeVisible}
          onClick={() => setChromeVisible((current) => !current)}
        >
          {chromeVisible ? t('builder.chromeHide') : t('builder.chromeShow')}
        </Button>

        <span role="status" className="text-xs text-muted-foreground">
          {rendering ? t('builder.previewLoading') : ''}
        </span>
      </div>

      {error !== null && <Notice tone="danger">{error}</Notice>}
      {clipboardNotice !== null && (
        <Notice
          tone="info"
          onDismiss={() => setClipboardNotice(null)}
          dismissLabel={t('builder.clipboardDismiss')}
        >
          {clipboardNotice}
        </Notice>
      )}

      <div
        className={cn(
          'grid gap-4',
          // The detail panel only needs its full 20rem once there is
          // something to show in it — while it just holds the "select a
          // block" placeholder, that width is better spent on the preview
          // itself (real page builders never reserve settings-panel width
          // for nothing selected).
          selectedKeys.size > 0
            ? 'lg:grid-cols-[16rem_minmax(0,1fr)_20rem]'
            : 'lg:grid-cols-[16rem_minmax(0,1fr)_14rem]',
        )}
      >
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>
                <h3>{t('builder.outlineHeading')}</h3>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <BlockOutline
                blocks={present}
                selectedKeys={selectedKeys}
                lockedKeys={lockedKeys}
                onSelect={handleOutlineSelect}
                onMove={handleMove}
                onInsert={handleInsert}
                onRemove={handleRemove}
                onToggleLock={handleToggleLock}
                onMoveSelectionUp={handleMoveSelectionUp}
                onMoveSelectionDown={handleMoveSelectionDown}
                onRemoveSelection={handleRemoveSelection}
                disabled={disabled}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h3>{t('builder.pickerHeading')}</h3>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <BlockPicker
                disabled={disabled}
                onAdd={(type) => handleInsert(type, present.length)}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h3>{t('builder.patterns.heading')}</h3>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <PatternPicker
                token={token}
                disabled={disabled}
                blocks={present}
                selectedKeys={selectedKeys}
                onInsertPattern={handleInsertPattern}
                onApplyTemplate={handleApplyTemplate}
              />
            </CardBody>
          </Card>
        </div>

        <PreviewFrame
          html={html}
          viewport={viewport}
          selectedKey={singleSelected}
          chromeVisible={chromeVisible && !disabled}
          title={t('builder.previewTitle')}
          handlers={{
            onSelect: handlePreviewSelect,
            onMove: handleMove,
            onInsert: handleInsert,
            onInlineEdit: handleInlineEdit,
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle>
              <h3>{t('builder.detailHeading')}</h3>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {selectedKeys.size > 1 ? (
              <p className="text-sm text-muted-foreground">{t('builder.detailMultiple')}</p>
            ) : selected === null || selectedDefinition === undefined ? (
              <p className="text-sm text-muted-foreground">{t('builder.detailEmpty')}</p>
            ) : (
              <div className="flex flex-col gap-4">
                <BlockForm
                  idPrefix={`builder-${selected.key}`}
                  definition={selectedDefinition}
                  data={selected.data}
                  disabled={disabled}
                  onChange={(data) => commit(updateBlockData(present, selected.key, data))}
                />
                <BlockVariantControl
                  variant={selected.data.variant as BlockVariant | undefined}
                  disabled={disabled}
                  onChange={(variant) => handleVariantChange(selected.key, selected, variant)}
                />
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
