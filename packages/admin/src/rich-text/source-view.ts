import { htmlToSlate, slateToHtml } from './html-export.js'
import { markdownToSlate, slateToMarkdown } from './markdown.js'
import type { CustomElement } from './slate-types.js'

/**
 * The three views the toolbar's toggle switches between (L21 task 5). `rich`
 * is the normal Slate `<Editable>`; the other two swap it for a `<textarea>`
 * of the same document serialised as text — `rich-text-editor.tsx` owns when
 * the swap happens and reconciles the two representations through these two
 * functions, never live on every keystroke (so a half-typed `**` is not
 * reparsed mid-edit).
 */
export type RichTextViewMode = 'rich' | 'markdown' | 'html'

export function documentToSource(
  nodes: readonly CustomElement[],
  mode: 'markdown' | 'html',
): string {
  return mode === 'markdown' ? slateToMarkdown(nodes) : slateToHtml(nodes)
}

export function sourceToDocument(text: string, mode: 'markdown' | 'html'): CustomElement[] {
  return mode === 'markdown' ? markdownToSlate(text) : htmlToSlate(text)
}
