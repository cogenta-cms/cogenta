import { createHash } from 'node:crypto'
import { THEME_TOGGLE_SCRIPT } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import {
  buildDefaultCsp,
  cspClassFor,
  cspHashOf,
  defaultCspFor,
  FORM_CONDITIONS_SCRIPT_HASH,
  THEME_TOGGLE_SCRIPT_HASH,
} from '../src/commands/csp.js'
import { FORM_CONDITIONS_SCRIPT } from '../src/commands/forms-page.js'

function directive(policy: string, name: string): readonly string[] {
  const found = policy
    .split(';')
    .map((part) => part.trim().split(/\s+/u))
    .find((parts) => parts[0] === name)
  return found === undefined ? [] : found.slice(1)
}

describe('default Content-Security-Policy (pentest F-04)', () => {
  it('hashes the theme-toggle script byte for byte as sha256 base64', () => {
    const expected = `'sha256-${createHash('sha256').update(THEME_TOGGLE_SCRIPT, 'utf8').digest('base64')}'`
    expect(THEME_TOGGLE_SCRIPT_HASH).toBe(expected)
    expect(cspHashOf('x')).toBe("'sha256-LXEWQrcmsEQBYnyp+6wy9chTD7GQPMTbAiWHF5IaSIE='")
  })

  it('changes the hash when a single character of the script changes', () => {
    expect(cspHashOf(`${THEME_TOGGLE_SCRIPT} `)).not.toBe(THEME_TOGGLE_SCRIPT_HASH)
  })

  it.each(['admin', 'public', 'form'] as const)(
    'never allows inline scripts, eval or a wildcard in script-src (%s)',
    (kind) => {
      const policy = buildDefaultCsp(kind, { remoteWebFonts: false })
      const scripts = directive(policy, 'script-src')
      expect(scripts).toContain("'self'")
      expect(scripts).not.toContain("'unsafe-inline'")
      expect(scripts).not.toContain("'unsafe-eval'")
      expect(scripts).not.toContain('*')
      expect(scripts).not.toContain('https:')
      expect(directive(policy, 'object-src')).toEqual(["'none'"])
      expect(directive(policy, 'base-uri')).toEqual(["'self'"])
      expect(directive(policy, 'frame-ancestors')).toEqual(["'self'"])
    },
  )

  it('lets a public page run only the theme-toggle script, by hash', () => {
    const scripts = directive(buildDefaultCsp('public', { remoteWebFonts: false }), 'script-src')
    expect(scripts).toEqual(["'self'", THEME_TOGGLE_SCRIPT_HASH])
  })

  it('adds the form script hash and Turnstile only to form pages', () => {
    const form = buildDefaultCsp('form', { remoteWebFonts: false })
    expect(FORM_CONDITIONS_SCRIPT_HASH).toBe(cspHashOf(FORM_CONDITIONS_SCRIPT))
    expect(directive(form, 'script-src')).toContain(FORM_CONDITIONS_SCRIPT_HASH)
    expect(directive(form, 'script-src')).toContain('https://challenges.cloudflare.com')
    expect(directive(form, 'frame-src')).toContain('https://challenges.cloudflare.com')

    const page = buildDefaultCsp('public', { remoteWebFonts: false })
    expect(page).not.toContain('challenges.cloudflare.com')
    expect(page).not.toContain(FORM_CONDITIONS_SCRIPT_HASH)
  })

  it('frames only the embed providers a consented embed can produce', () => {
    const frames = directive(buildDefaultCsp('public', { remoteWebFonts: false }), 'frame-src')
    expect([...frames].sort()).toEqual(
      [
        'https://geo.dailymotion.com',
        'https://open.spotify.com',
        'https://player.vimeo.com',
        'https://w.soundcloud.com',
        'https://www.youtube-nocookie.com',
      ].sort(),
    )
  })

  it('opens Google Fonts only when the site opted in', () => {
    const off = buildDefaultCsp('public', { remoteWebFonts: false })
    const on = buildDefaultCsp('public', { remoteWebFonts: true })
    expect(off).not.toContain('googleapis')
    expect(off).not.toContain('gstatic')
    expect(directive(on, 'style-src')).toContain('https://fonts.googleapis.com')
    expect(directive(on, 'font-src')).toContain('https://fonts.gstatic.com')
  })

  it('lets the admin editors draw to a canvas and preview uploads (data: and blob: images)', () => {
    const images = directive(buildDefaultCsp('admin', { remoteWebFonts: false }), 'img-src')
    expect(images).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']))
    expect(directive(buildDefaultCsp('admin', { remoteWebFonts: false }), 'connect-src')).toEqual([
      "'self'",
    ])
  })

  it('loads nothing on the JSON API', () => {
    const policy = buildDefaultCsp('api', { remoteWebFonts: false })
    expect(directive(policy, 'default-src')).toEqual(["'none'"])
    expect(policy).not.toContain('script-src')
  })

  it('classifies paths: admin, form pages (incl. the failed-submit page), API, public', () => {
    expect(cspClassFor('/admin')).toBe('admin')
    expect(cspClassFor('/admin/collections/post')).toBe('admin')
    expect(cspClassFor('/administrator')).toBe('public')
    expect(cspClassFor('/forms/contact')).toBe('form')
    expect(cspClassFor('/api/forms/contact/submit')).toBe('form')
    expect(cspClassFor('/api/forms/submissions')).toBe('api')
    expect(cspClassFor('/api/content/page')).toBe('api')
    expect(cspClassFor('/blog/hello')).toBe('public')
    expect(cspClassFor('/_cogenta/unlock')).toBe('public')
  })

  it('memoises per class and font setting', () => {
    expect(defaultCspFor('/a', { remoteWebFonts: false })).toBe(
      defaultCspFor('/b', { remoteWebFonts: false }),
    )
    expect(defaultCspFor('/a', { remoteWebFonts: true })).not.toBe(
      defaultCspFor('/a', { remoteWebFonts: false }),
    )
  })
})
