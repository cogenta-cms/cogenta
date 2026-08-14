import type { Editor } from 'slate'

/** `link` sits inside a line of text, `media` is a fixed chip nothing can type into — Slate treats neither as an ordinary block by default. */
export function withInlines(editor: Editor): Editor {
  const { isInline, isVoid } = editor

  editor.isInline = (element) => element.type === 'link' || isInline(element)
  editor.isVoid = (element) => element.type === 'media' || isVoid(element)

  return editor
}
