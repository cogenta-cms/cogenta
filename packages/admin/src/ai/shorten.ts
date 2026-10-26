/**
 * A long text cut at a word with an ellipsis — never mid-sentence without a
 * sign that it was cut. Whitespace runs collapse, so a quoted passage reads
 * as one paragraph.
 */
export function shorten(text: string, max = 70): string {
  const oneLine = text.replace(/\s+/gu, ' ').trim()
  if (oneLine.length <= max) return oneLine
  const cut = oneLine.slice(0, max)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20))}…`
}
