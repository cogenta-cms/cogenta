import type { ChatContentPart } from './types.js'

/**
 * Extracts the text of a message's `content`, dropping any image parts —
 * used wherever a vendor's wire format only ever accepts a string (tool
 * results, function responses). Every existing caller passes a plain
 * string here already, so this is the identity function for them; an
 * array of `ChatContentPart` (not something the runtime produces for a
 * `tool`-role message today) degrades to its text parts joined together
 * rather than failing to compile or throwing.
 */
export function textOnlyContent(
  content: string | readonly ChatContentPart[] | undefined,
): string | undefined {
  if (content === undefined || typeof content === 'string') return content
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}
