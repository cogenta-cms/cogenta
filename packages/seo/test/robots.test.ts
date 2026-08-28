import { describe, expect, it } from 'vitest'
import { renderRobotsTxt, robotsRuleDisallowsEverything } from '../src/robots.js'
import { site } from './fixtures.js'

describe('robots.txt', () => {
  it('allows everything and points at the sitemap by default', () => {
    expect(renderRobotsTxt({ site })).toBe(
      ['User-agent: *', 'Allow: /', '', 'Sitemap: https://example.com/sitemap.xml'].join('\n') +
        '\n',
    )
  })

  it('blocks every crawler when the environment is not indexable', () => {
    const output = renderRobotsTxt({ site, allowIndexing: false })

    expect(output).toContain('User-agent: *\nDisallow: /')
    // The sitemap line still stands: it is host-level, and a staging host that
    // serves one is easier to diagnose than one that silently omits it.
    expect(output).toContain('Sitemap: https://example.com/sitemap.xml')
  })

  it('renders several groups, allow before disallow', () => {
    const output = renderRobotsTxt({
      site,
      groups: [
        { userAgent: '*', allow: ['/'], disallow: ['/admin'] },
        { userAgent: ['GPTBot', 'CCBot'], disallow: ['/'], crawlDelay: 10 },
      ],
    })

    expect(output).toContain('User-agent: *\nAllow: /\nDisallow: /admin')
    expect(output).toContain('User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\nCrawl-delay: 10')
  })

  it('makes every sitemap path absolute, as the specification requires', () => {
    const output = renderRobotsTxt({ site, sitemaps: ['/sitemap.xml', '/news-sitemap.xml'] })

    expect(output).toContain('Sitemap: https://example.com/sitemap.xml')
    expect(output).toContain('Sitemap: https://example.com/news-sitemap.xml')
  })

  it('puts the sitemap lines outside every group, where all crawlers read them', () => {
    const output = renderRobotsTxt({ site, groups: [{ userAgent: '*', disallow: ['/private'] }] })
    const lines = output.trim().split('\n')

    expect(lines.at(-1)).toBe('Sitemap: https://example.com/sitemap.xml')
    expect(lines.at(-2)).toBe('')
  })

  it('refuses a value containing a newline, which robots.txt cannot escape', () => {
    expect(() =>
      renderRobotsTxt({ site, groups: [{ userAgent: '*', disallow: ['/a\nDisallow: /'] }] }),
    ).toThrow(/may not contain a line break/)

    expect(() => renderRobotsTxt({ site, groups: [{ userAgent: '*\nDisallow: /' }] })).toThrow(
      /may not contain a line break/,
    )
  })

  it('ends with exactly one newline', () => {
    expect(renderRobotsTxt({ site })).toMatch(/[^\n]\n$/u)
  })

  describe('custom rules (fiche 50 task 4)', () => {
    it('merges an admin-written block after the derived group and before the sitemap', () => {
      const output = renderRobotsTxt({ site, customRules: 'User-agent: GPTBot\nDisallow: /' })

      expect(output).toBe(
        `${[
          'User-agent: *',
          'Allow: /',
          '',
          'User-agent: GPTBot',
          'Disallow: /',
          '',
          'Sitemap: https://example.com/sitemap.xml',
        ].join('\n')}\n`,
      )
    })

    it('contributes nothing when absent or blank', () => {
      expect(renderRobotsTxt({ site, customRules: '' })).toBe(renderRobotsTxt({ site }))
      expect(renderRobotsTxt({ site, customRules: '   \n  ' })).toBe(renderRobotsTxt({ site }))
    })

    it('normalises CRLF line endings', () => {
      const output = renderRobotsTxt({ site, customRules: 'User-agent: Bing\r\nCrawl-delay: 5' })
      expect(output).toContain('User-agent: Bing\nCrawl-delay: 5')
    })
  })

  describe('detecting a rule that blocks every crawler', () => {
    it('flags a bare "Disallow: /" line, whatever its surrounding case or spacing', () => {
      expect(robotsRuleDisallowsEverything('Disallow: /')).toBe(true)
      expect(robotsRuleDisallowsEverything('disallow:   /')).toBe(true)
      expect(
        robotsRuleDisallowsEverything('User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /'),
      ).toBe(true)
    })

    it('does not flag a scoped or partial disallow', () => {
      expect(robotsRuleDisallowsEverything('Disallow: /admin')).toBe(false)
      expect(robotsRuleDisallowsEverything('Allow: /')).toBe(false)
      expect(robotsRuleDisallowsEverything('')).toBe(false)
    })
  })
})
