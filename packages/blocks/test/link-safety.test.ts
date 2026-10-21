import { describe, expect, it } from 'vitest'
import { isScriptUrl, safeParseBlock } from '../src/index.js'

/**
 * Security review of 2026-10-21: an `editor` could save a call to action
 * whose target is `javascript:…` and take the session of the first admin who
 * clicked it. The scheme is refused at write time (and neutralised again
 * when rendered, in `@cogenta/theme-kit`).
 */
describe('a link cannot be a script', () => {
  it.each([
    'javascript:alert(1)',
    'java\tscript:x',
    ' JAVASCRIPT:x',
    'vbscript:x',
    'data:text/html,x',
  ])('recognises %j as a script URL', (value) => {
    expect(isScriptUrl(value)).toBe(true)
  })

  it.each([
    '/page',
    '#top',
    'https://example.org',
    'mailto:a@b.c',
    'tel:+331',
    'ftp://example.org',
  ])('leaves %j alone', (value) => {
    expect(isScriptUrl(value)).toBe(false)
  })

  it('refuses a call to action pointing at javascript:', () => {
    const outcome = safeParseBlock({
      _type: 'cta',
      _key: 'c1',
      _version: '1.0.0',
      title: 'Go',
      actions: [{ label: 'Click', target: { href: 'javascript:alert(document.domain)' } }],
    })
    expect(outcome.ok).toBe(false)
  })

  it('refuses an embed whose url is javascript:', () => {
    const outcome = safeParseBlock({
      _type: 'embed',
      _key: 'e1',
      _version: '1.0.0',
      provider: 'youtube',
      ratio: '16:9',
      consentRequired: true,
      url: 'javascript:alert(document.domain)',
    })
    expect(outcome.ok).toBe(false)
  })

  it('still accepts the same call to action with a real address', () => {
    const outcome = safeParseBlock({
      _type: 'cta',
      _key: 'c1',
      _version: '1.0.0',
      title: 'Go',
      actions: [{ label: 'Click', target: { href: 'https://example.org/install' } }],
    })
    expect(outcome.ok).toBe(true)
  })
})
