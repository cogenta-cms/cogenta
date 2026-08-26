import type { BlockVariant } from '@cogenta/blocks'
import { type JSX, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { renderDraft } from '../api/builder-client.js'
import { ApiError } from '../api/client.js'
import type { ContentBlock } from '../api/content-client.js'
import { BlockForm } from '../blocks/block-form.js'
import { blockDefinition } from '../blocks/vocabulary.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'
import {
  insertBlock,
  moveBlock,
  removeBlock,
  setInlineText,
  updateBlockData,
} from './block-moves.js'
import { BlockOutline } from './block-outline.js'
import { BlockPicker } from './block-picker.js'
import { BlockVariantControl } from './block-variant.js'
import type { History } from './history.js'
import { canRedo, canUndo, createHistory, push, redo, reset, undo } from './history.js'
import { PreviewFrame } from './preview-frame.js'
import type { Viewport } from './viewports.js'
import { VIEWPORTS } from './viewports.js'

/**
 * The visual page builder (L16).
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
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [chromeVisible, setChromeVisible] = useState(true)
  const [html, setHtml] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  function handleMove(key: string, toIndex: number): void {
    if (disabled) return
    commit(moveBlock(present, key, toIndex))
  }

  function handleInsert(type: string, atIndex: number): void {
    if (disabled) return
    const inserted = insertBlock(present, type, atIndex)
    if (inserted.key === null) return
    commit(inserted.blocks)
    setSelectedKey(inserted.key)
  }

  function handleRemove(key: string): void {
    if (disabled) return
    commit(removeBlock(present, key))
    if (selectedKey === key) setSelectedKey(null)
  }

  function handleInlineEdit(key: string, field: string, text: string): void {
    if (disabled) return
    // `setInlineText` refuses anything that is not a declared plain-text field
    // of that block, so a `data-field` the theme grows later cannot silently
    // overwrite a structured value.
    commit(setInlineText(present, key, field, text))
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

  /** Ctrl/⌘+Z and Ctrl/⌘+Shift+Z, the two every editor already knows. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return
    event.preventDefault()
    step(event.shiftKey ? redo : undo)
  }

  const selected = present.find((block) => block.key === selectedKey) ?? null
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

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
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
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
                onMove={handleMove}
                onInsert={handleInsert}
                onRemove={handleRemove}
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
        </div>

        <PreviewFrame
          html={html}
          viewport={viewport}
          selectedKey={selectedKey}
          chromeVisible={chromeVisible && !disabled}
          title={t('builder.previewTitle')}
          handlers={{
            onSelect: setSelectedKey,
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
            {selected === null || selectedDefinition === undefined ? (
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
