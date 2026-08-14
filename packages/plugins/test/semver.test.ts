import { describe, expect, it } from 'vitest'
import { compareVersions, parseVersion, satisfiesRange } from '../src/semver.js'

describe('parseVersion', () => {
  it('parses a well-formed version', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
  })

  it('returns null for a non-version string', () => {
    expect(parseVersion('not-a-version')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    const v = (s: string) => {
      const parsed = parseVersion(s)
      if (parsed === null) throw new Error(`expected "${s}" to parse`)
      return parsed
    }
    expect(compareVersions(v('1.0.0'), v('2.0.0'))).toBe(-1)
    expect(compareVersions(v('2.0.0'), v('1.0.0'))).toBe(1)
    expect(compareVersions(v('1.1.0'), v('1.2.0'))).toBe(-1)
    expect(compareVersions(v('1.2.1'), v('1.2.0'))).toBe(1)
    expect(compareVersions(v('1.2.3'), v('1.2.3'))).toBe(0)
  })
})

describe('satisfiesRange — caret', () => {
  it.each([
    ['1.0.0', '^1.0.0', true],
    ['1.2.3', '^1.0.0', true],
    ['1.9.9', '^1.0.0', true],
    ['2.0.0', '^1.0.0', false],
    ['0.9.0', '^1.0.0', false],
  ])('%s satisfies %s => %s', (version, range, expected) => {
    expect(satisfiesRange(version, range)).toBe(expected)
  })

  it('treats 0.x.y caret ranges as compatible only within the same minor', () => {
    expect(satisfiesRange('0.2.5', '^0.2.3')).toBe(true)
    expect(satisfiesRange('0.3.0', '^0.2.3')).toBe(false)
    expect(satisfiesRange('0.2.2', '^0.2.3')).toBe(false)
  })

  it('treats 0.0.x caret ranges as compatible only for the exact patch', () => {
    expect(satisfiesRange('0.0.3', '^0.0.3')).toBe(true)
    expect(satisfiesRange('0.0.4', '^0.0.3')).toBe(false)
  })
})

describe('satisfiesRange — tilde', () => {
  it.each([
    ['1.2.5', '~1.2.0', true],
    ['1.2.0', '~1.2.0', true],
    ['1.3.0', '~1.2.0', false],
    ['1.1.9', '~1.2.0', false],
  ])('%s satisfies %s => %s', (version, range, expected) => {
    expect(satisfiesRange(version, range)).toBe(expected)
  })
})

describe('satisfiesRange — exact and compound', () => {
  it('matches a bare exact version only exactly', () => {
    expect(satisfiesRange('1.0.0', '1.0.0')).toBe(true)
    expect(satisfiesRange('1.0.1', '1.0.0')).toBe(false)
  })

  it('ANDs a space-separated comparator list', () => {
    expect(satisfiesRange('1.5.0', '>=1.0.0 <2.0.0')).toBe(true)
    expect(satisfiesRange('2.0.0', '>=1.0.0 <2.0.0')).toBe(false)
    expect(satisfiesRange('0.9.0', '>=1.0.0 <2.0.0')).toBe(false)
  })
})

describe('satisfiesRange — malformed input never throws', () => {
  it('returns false for an unparseable version or range', () => {
    expect(satisfiesRange('not-a-version', '^1.0.0')).toBe(false)
    expect(satisfiesRange('1.0.0', '^not-a-range')).toBe(false)
  })
})
