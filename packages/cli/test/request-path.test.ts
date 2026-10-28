import { describe, expect, it } from 'vitest'
import { hasControlCharacter, pathHasControlCharacter } from '../src/commands/request-path.js'

describe('pathHasControlCharacter', () => {
  it.each(['/%00', '/blog/%00', '/en/a%00', '/categorie/a%00b', '/a%0Ab', '/a%7F'])(
    'flags %s, whose decoded form carries a control character',
    (path) => {
      expect(pathHasControlCharacter(path)).toBe(true)
    },
  )

  it.each(['/', '/blog/caf%C3%A9', '/en/blog/hello-world', '/a%20b', '/%E0%A4%A'])(
    'leaves %s to the ordinary routing',
    (path) => {
      expect(pathHasControlCharacter(path)).toBe(false)
    },
  )
})

describe('hasControlCharacter', () => {
  it('flags a decoded value with a NUL byte', () => {
    expect(hasControlCharacter('a\u0000b')).toBe(true)
    expect(hasControlCharacter('0194f9a0-1111-7000-8000-000000000000')).toBe(false)
  })
})
