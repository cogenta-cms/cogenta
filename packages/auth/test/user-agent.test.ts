import { describe, expect, it } from 'vitest'
import { parseUserAgent } from '../src/user-agent.js'

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const CHROME_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
const OPERA_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0'
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const CURL = 'curl/8.4.0'

describe('parseUserAgent', () => {
  it('reports "unknown" for both fields when there is nothing to parse', () => {
    expect(parseUserAgent(undefined)).toEqual({ browser: 'unknown', device: 'unknown' })
    expect(parseUserAgent(null)).toEqual({ browser: 'unknown', device: 'unknown' })
    expect(parseUserAgent('')).toEqual({ browser: 'unknown', device: 'unknown' })
    expect(parseUserAgent('   ')).toEqual({ browser: 'unknown', device: 'unknown' })
  })

  it('identifies Chrome on desktop', () => {
    expect(parseUserAgent(CHROME_WINDOWS)).toEqual({ browser: 'chrome', device: 'desktop' })
  })

  it('identifies Safari on desktop', () => {
    expect(parseUserAgent(SAFARI_MAC)).toEqual({ browser: 'safari', device: 'desktop' })
  })

  it('identifies Safari on a phone as mobile, not desktop', () => {
    expect(parseUserAgent(SAFARI_IPHONE)).toEqual({ browser: 'safari', device: 'mobile' })
  })

  it('identifies Chrome on a tablet as tablet, not mobile', () => {
    expect(parseUserAgent(CHROME_IPAD)).toEqual({ browser: 'chrome', device: 'tablet' })
  })

  it('identifies Firefox on desktop', () => {
    expect(parseUserAgent(FIREFOX_LINUX)).toEqual({ browser: 'firefox', device: 'desktop' })
  })

  it('identifies Edge, not Chrome, even though "Chrome" appears in its UA string', () => {
    expect(parseUserAgent(EDGE_WINDOWS)).toEqual({ browser: 'edge', device: 'desktop' })
  })

  it('identifies Opera, not Chrome, even though "Chrome" appears in its UA string', () => {
    expect(parseUserAgent(OPERA_WINDOWS)).toEqual({ browser: 'opera', device: 'desktop' })
  })

  it('identifies an Android phone as mobile', () => {
    expect(parseUserAgent(ANDROID_CHROME)).toEqual({ browser: 'chrome', device: 'mobile' })
  })

  it('identifies a well-behaved crawler as a bot', () => {
    expect(parseUserAgent(GOOGLEBOT)).toEqual({ browser: 'bot', device: 'bot' })
  })

  it('identifies a bare HTTP client as a bot', () => {
    expect(parseUserAgent(CURL)).toEqual({ browser: 'other', device: 'bot' })
  })

  it('falls back to "other" for a browser it does not recognise, without throwing', () => {
    const result = parseUserAgent('SomeExoticBrowser/1.0')
    expect(result.browser).toBe('other')
    expect(result.device).toBe('desktop')
  })
})
