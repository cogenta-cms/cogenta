import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LinkTargetField, type LinkTargetValue } from '../../src/fields/link-target-field.js'

/**
 * L20 audit, critical bug 1: `packages/admin/src/fields/link-target-field.tsx`'s
 * `isEntryTarget` used to guard only against `value === null`
 * (`value !== null && 'collection' in value`) — so a `value` of `undefined`
 * threw `TypeError: Cannot use 'in' operator to search for 'collection' in
 * undefined` instead of being treated as "no target yet".
 *
 * `LinkTargetValue`'s own type only ever promises `href-object | entry-object
 * | null`, but the real crash (switching an entry with a `blocks` field from
 * the page builder back to the plain form) handed this field `undefined` at
 * runtime regardless — unmounting the builder left one render with a value
 * that had not been reset to `null` yet. This test reproduces exactly that
 * mismatch between the type and the real prop, the same way the crash did.
 */
describe('LinkTargetField — a value of undefined (not just null)', () => {
  it('renders in URL mode instead of throwing', () => {
    const onChange = vi.fn()
    expect(() =>
      render(
        <LinkTargetField
          id="cta-link"
          label="Lien"
          value={undefined as unknown as LinkTargetValue}
          onChange={onChange}
        />,
      ),
    ).not.toThrow()

    const urlMode = screen.getByRole('radio', { name: 'URL' }) as HTMLInputElement
    expect(urlMode.checked).toBe(true)
  })

  it('still recognises a real entry target once one is set', () => {
    const value: LinkTargetValue = { collection: 'pages', id: 'entry-1' }
    render(<LinkTargetField id="cta-link" label="Lien" value={value} onChange={vi.fn()} />)

    const entryMode = screen.getByRole('radio', { name: /entrée/i }) as HTMLInputElement
    expect(entryMode.checked).toBe(true)
  })
})
