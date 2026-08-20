import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Editor, Range, Element as SlateElement, Transforms } from 'slate'
import { ReactEditor, useSlate } from 'slate-react'
import type { AssistCapability, AssistSuggestion } from '../api/assist-client.js'
import { getAssistCapabilities, runAssistTool } from '../api/assist-client.js'
import { ApiError } from '../api/client.js'
import { useAuth } from '../auth/auth-context.js'
import { Button, Notice } from '../ui/index.js'

/**
 * Fiche 30 task 4 — the writing assistant on rich text.
 *
 * `AssistantPanel` (the per-field panel) deliberately skips `richText`
 * fields, for the reason its own comment gives: a portable-text document has
 * no single string to overwrite, and guessing where a suggestion goes risks
 * destroying marks and links. This component avoids the question entirely by
 * operating on the editor's **current selection** and replacing exactly that
 * range:
 *
 * - `Transforms.insertText(editor, text, { at: selection })` deletes the
 *   selected range and inserts plain text in its place — it never touches a
 *   text node outside the selection, so a bold word or a link one character
 *   before or after the selection is untouched (the criterion's "en
 *   conservant les marques adjacentes").
 * - The selection is refused up front (the button disables) when it spans a
 *   `link` or `media` inline — replacing *part* of a link's text is exactly
 *   the structural corruption this whole feature exists to avoid, and there
 *   is no correct guess for what should happen to the other half.
 * - Every `Transforms` call goes through the same editor instance
 *   `withHistory` already wraps (`rich-text-editor.tsx`), so the accept is on
 *   the editor's own undo stack — a `Ctrl/⌘+Z` right after undoes exactly
 *   this call, same as it would undo a keystroke.
 *
 * Same degradation as every other assistant surface (R2): no tool with empty
 * `needs` in the toolset means this renders nothing.
 */

const SUPPORTED_TOOLS = ['assist.rewrite', 'assist.proofread', 'assist.summarise'] as const

/** Exported for its own unit test — this is the one guard that keeps a partial replacement from corrupting a link or a media chip. */
export function selectionCrossesInline(editor: Editor, selection: Range): boolean {
  const [match] = Editor.nodes(editor, {
    at: selection,
    match: (node) =>
      SlateElement.isElement(node) && (node.type === 'link' || node.type === 'media'),
  })
  return match !== undefined
}

export function RichTextSelectionAssist({
  disabled,
}: {
  readonly disabled: boolean
}): JSX.Element | null {
  const { t } = useTranslation()
  const editor = useSlate()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const [tools, setTools] = useState<readonly AssistCapability[]>([])
  const [available, setAvailable] = useState(false)
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ readonly text: string; readonly at: Range } | null>(null)

  const load = useCallback(async () => {
    if (token === null) return
    try {
      const capabilities = await getAssistCapabilities(token)
      setAvailable(capabilities.available)
      setTools(
        capabilities.tools.filter((tool) =>
          (SUPPORTED_TOOLS as readonly string[]).includes(tool.tool),
        ),
      )
    } catch {
      setAvailable(false)
      setTools([])
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  if (!available || tools.length === 0 || token === null) return null

  const { selection } = editor
  const hasSelection = selection !== null && Range.isExpanded(selection)
  const selectionOk = hasSelection && !selectionCrossesInline(editor, selection)

  async function run(tool: AssistCapability): Promise<void> {
    if (token === null || selection === null || !selectionOk) return
    const text = Editor.string(editor, selection)
    if (text.trim() === '') return

    setRunning(tool.tool)
    setError(null)
    setPreview(null)
    try {
      const suggestion = await runAssistTool<AssistSuggestion>(token, tool.tool, { text })
      const candidate = suggestion.suggestions[0]
      if (candidate === undefined) {
        setError(t('richTextAssist.empty'))
        return
      }
      setPreview({ text: candidate, at: selection })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('richTextAssist.runError'))
    } finally {
      setRunning(null)
    }
  }

  function accept(): void {
    if (preview === null) return
    ReactEditor.focus(editor)
    Transforms.select(editor, preview.at)
    // A single `Transforms` call: one entry on the editor's own history stack,
    // so `Ctrl/⌘+Z` undoes exactly this and nothing else.
    Transforms.insertText(editor, preview.text, { at: preview.at })
    setPreview(null)
    setOpen(false)
  }

  return (
    <div className="rich-text-assist">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled || !selectionOk}
        title={hasSelection ? undefined : t('richTextAssist.needsSelection')}
        onMouseDown={(event) => {
          event.preventDefault()
          setOpen((current) => !current)
        }}
      >
        {t('richTextAssist.button')}
      </Button>

      {open && (
        <div className="rich-text-assist__panel flex flex-col gap-2 rounded-md border border-input p-3">
          {!selectionOk && (
            <p className="m-0 text-sm text-muted-foreground">
              {hasSelection ? t('richTextAssist.crossesLink') : t('richTextAssist.needsSelection')}
            </p>
          )}

          {selectionOk && (
            <div className="flex flex-wrap gap-2">
              {tools.map((tool) => (
                <Button
                  key={tool.tool}
                  type="button"
                  size="sm"
                  disabled={running !== null}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    void run(tool)
                  }}
                >
                  {running === tool.tool ? t('richTextAssist.running') : tool.label}
                </Button>
              ))}
            </div>
          )}

          {error !== null && (
            <Notice tone="danger" live="assertive">
              <p className="m-0">{error}</p>
            </Notice>
          )}

          {preview !== null && (
            <div className="flex flex-col gap-2">
              <p className="m-0 whitespace-pre-wrap text-sm">{preview.text}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    accept()
                  }}
                >
                  {t('richTextAssist.accept')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    setPreview(null)
                  }}
                >
                  {t('richTextAssist.discard')}
                </Button>
              </div>
              <p className="m-0 text-xs text-muted-foreground">{t('richTextAssist.undoHint')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
