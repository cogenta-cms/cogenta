import { type Editor, Transforms } from 'slate'
import { htmlToSlateFragment } from './paste-html.js'

/** `link` sits inside a line of text, `media` and `hr` (fiche 42 task 2) are fixed elements nothing can type into — Slate treats neither as an ordinary block by default. */
export function withInlines(editor: Editor): Editor {
  const { isInline, isVoid, insertData } = editor

  editor.isInline = (element) => element.type === 'link' || isInline(element)
  editor.isVoid = (element) => element.type === 'media' || element.type === 'hr' || isVoid(element)

  /**
   * Clean-paste (fiche 04 task 4): with HTML on the clipboard, this is the
   * one hook Slate offers to intercept it before its own default
   * `text/plain` fallback runs. `htmlToSlateFragment` maps that HTML onto
   * the editor's own vocabulary; `null` (no HTML, or none of it usable)
   * defers to the original behaviour untouched, which is what already kept
   * R3 for free before this file existed.
   */
  editor.insertData = (data: DataTransfer) => {
    const html = data.getData('text/html')
    if (html !== '') {
      const fragment = htmlToSlateFragment(html)
      if (fragment !== null) {
        Transforms.insertFragment(editor, fragment)
        return
      }
    }
    insertData(data)
  }

  return editor
}
