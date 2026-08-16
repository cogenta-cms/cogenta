import { describe, expect, it } from 'vitest'
import { classifyDevice } from '../src/device.js'

const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const DESKTOP_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

describe('classifyDevice', () => {
  it('classifies a desktop Windows browser as desktop', () => {
    expect(classifyDevice(DESKTOP_CHROME)).toBe('desktop')
  })

  it('classifies a desktop macOS browser as desktop', () => {
    expect(classifyDevice(DESKTOP_MAC)).toBe('desktop')
  })

  it('classifies an iPhone as mobile', () => {
    expect(classifyDevice(IPHONE)).toBe('mobile')
  })

  it('classifies an Android phone as mobile', () => {
    expect(classifyDevice(ANDROID_PHONE)).toBe('mobile')
  })

  it('classifies an iPad as tablet', () => {
    expect(classifyDevice(IPAD)).toBe('tablet')
  })

  it('classifies an Android tablet (no "Mobile" token) as tablet', () => {
    expect(classifyDevice(ANDROID_TABLET)).toBe('tablet')
  })

  it('classifies a missing User-Agent as other', () => {
    expect(classifyDevice(undefined)).toBe('other')
    expect(classifyDevice(null)).toBe('other')
    expect(classifyDevice('')).toBe('other')
  })

  it('classifies an unrecognised User-Agent as other', () => {
    expect(classifyDevice('SomeBot/1.0 (+https://example.com/bot)')).toBe('other')
  })

  it('never returns the input string itself, only a fixed category', () => {
    const category = classifyDevice(DESKTOP_CHROME)
    expect(['desktop', 'mobile', 'tablet', 'other']).toContain(category)
    expect(category).not.toBe(DESKTOP_CHROME)
  })
})
