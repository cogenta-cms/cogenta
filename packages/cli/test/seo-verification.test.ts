import { describe, expect, it } from 'vitest'
import { type SeoRenderDefaults, siteVerificationMetaTags } from '../src/commands/seo.js'

/**
 * Fiche 50 task 2 — Search Console/Bing Webmaster Tools meta-tag
 * verification. Unit-level (no server, no database): `siteVerificationMetaTags`
 * is a pure function of the settings it is handed, so the presence/absence
 * contract the fiche asks for ("Une balise de vérification apparaît dans le
 * HTML une fois le code renseigné") is provable without spinning up
 * `cogenta serve` — the real server wiring is covered end to end by
 * `serve-seo.test.ts` instead.
 */

const EMPTY: SeoRenderDefaults = {
  titleTemplate: '',
  collectionTitleTemplates: {},
  defaultMetaDescription: '',
  twitterHandle: '',
  defaultSocialImageUrl: '',
  sitemapCollectionSettings: {},
  googleSiteVerification: '',
  bingSiteVerification: '',
  robotsCustomRules: '',
}

describe('site verification meta tags', () => {
  it('renders nothing at all when neither token is set', () => {
    expect(siteVerificationMetaTags(EMPTY)).toBe('')
    expect(siteVerificationMetaTags(null)).toBe('')
    expect(siteVerificationMetaTags(undefined)).toBe('')
  })

  it('renders the Google tag once a token is set, and nothing for Bing', () => {
    const html = siteVerificationMetaTags({ ...EMPTY, googleSiteVerification: 'abc123' })
    expect(html).toBe('<meta name="google-site-verification" content="abc123" />')
  })

  it('renders the Bing tag once a token is set, and nothing for Google', () => {
    const html = siteVerificationMetaTags({ ...EMPTY, bingSiteVerification: 'XYZ-789' })
    expect(html).toBe('<meta name="msvalidate.01" content="XYZ-789" />')
  })

  it('renders both tags when both tokens are set', () => {
    const html = siteVerificationMetaTags({
      ...EMPTY,
      googleSiteVerification: 'abc123',
      bingSiteVerification: 'XYZ-789',
    })
    expect(html).toContain('<meta name="google-site-verification" content="abc123" />')
    expect(html).toContain('<meta name="msvalidate.01" content="XYZ-789" />')
  })

  it('HTML-escapes a token the same way every other admin-supplied attribute is escaped', () => {
    const html = siteVerificationMetaTags({
      ...EMPTY,
      googleSiteVerification: '"><script>alert(1)</script>',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&quot;&gt;')
  })
})
