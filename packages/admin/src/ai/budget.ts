/**
 * What a budget field holds: nothing ("no limit"), or a number of zero or
 * more. A negative or non-numeric value used to be stored as typed and shown
 * back as the agent's budget.
 */
export type BudgetFieldValue =
  | { readonly kind: 'empty' }
  | { readonly kind: 'value'; readonly value: number }
  | { readonly kind: 'invalid' }

export function parseBudgetField(
  text: string,
  options: { decimals?: boolean } = {},
): BudgetFieldValue {
  const trimmed = text.trim()
  if (trimmed === '') return { kind: 'empty' }
  const value = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(value) || value < 0) return { kind: 'invalid' }
  if (options.decimals !== true && !Number.isInteger(value)) return { kind: 'invalid' }
  return { kind: 'value', value }
}
