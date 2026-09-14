/**
 * Two readings of plain text a charity writes all the time, recognised from
 * the words themselves rather than from a setting contract B does not have.
 *
 * - **A breakdown.** Figures that are all percentages and add up to a whole
 *   (95 to 105, for rounding) say where the money goes: they are drawn as
 *   shares of one total, with a bar each, instead of four unrelated numbers.
 * - **What a gift pays for.** A call to action whose sentences start with an
 *   amount of money ("£12 buys a week of fresh vegetables for one family.")
 *   lists those amounts large beside what they pay for. Any other text stays
 *   the paragraph it was written as.
 */

export function shareOf(value: string, unit: string | undefined): number | undefined {
  const joined = unit === undefined ? value.trim() : `${value.trim()}${unit.trim()}`
  const match = /^(\d{1,3}(?:[.,]\d+)?)\s*%$/.exec(joined)
  if (match === null) return undefined
  const share = Number.parseFloat((match[1] as string).replace(',', '.'))
  return share >= 0 && share <= 100 ? share : undefined
}

export function isBreakdown(
  items: readonly { readonly value: string; readonly unit?: string | undefined }[],
): boolean {
  if (items.length < 2) return false
  const shares = items.map((item) => shareOf(item.value, item.unit))
  if (shares.some((share) => share === undefined)) return false
  const total = (shares as number[]).reduce((sum, share) => sum + share, 0)
  return total >= 95 && total <= 105
}

export interface Gift {
  readonly amount: string
  readonly text: string
}

export interface GiftList {
  readonly lead: string | undefined
  readonly gifts: readonly Gift[]
  readonly tail: string | undefined
}

const GIFT = /^([£€$]\s?\d[\d,.]*(?:\s(?:a|per|each)\s(?:week|month|year))?)\s+(\S[\s\S]*)$/u

/** The sentences of `text` that start with an amount, or `undefined` when fewer than two do. */
export function giftsOf(text: string | undefined): GiftList | undefined {
  if (text === undefined) return undefined
  const sentences = text
    .trim()
    .split(/(?<=[.;])\s+/)
    .filter((sentence) => sentence !== '')
  const first = sentences.findIndex((sentence) => GIFT.test(sentence))
  if (first === -1) return undefined
  let last = first
  while (last + 1 < sentences.length && GIFT.test(sentences[last + 1] as string)) last += 1
  const gifts = sentences.slice(first, last + 1).map((sentence) => {
    const match = GIFT.exec(sentence) as RegExpExecArray
    return { amount: match[1] as string, text: match[2] as string }
  })
  if (gifts.length < 2) return undefined
  const lead = sentences.slice(0, first).join(' ')
  const tail = sentences.slice(last + 1).join(' ')
  return {
    lead: lead === '' ? undefined : lead,
    gifts,
    tail: tail === '' ? undefined : tail,
  }
}
