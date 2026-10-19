import { describe, expect, it } from 'vitest'
import { shippedText } from '../src/i18n/shipped-text.js'

const t = ((key: string) =>
  key === 'shippedText.prompts.rewrite.description'
    ? 'Reformuler un passage en conservant son sens et ses faits.'
    : key) as unknown as Parameters<typeof shippedText>[2]

describe('a text Cogenta ships as data', () => {
  it('reads in the admin’s language while nobody has changed it', () => {
    expect(
      shippedText(
        'prompts.rewrite.description',
        'Rewrite a passage, keeping its meaning and its facts.',
        t,
      ),
    ).toBe('Reformuler un passage en conservant son sens et ses faits.')
  })

  it('reads as its owner wrote it once someone has', () => {
    expect(shippedText('prompts.rewrite.description', 'Our house style, please.', t)).toBe(
      'Our house style, please.',
    )
  })

  it('reads as served when the admin has no translation for it', () => {
    expect(shippedText('prompts.acme-summary.description', 'By Acme.', t)).toBe('By Acme.')
  })
})
