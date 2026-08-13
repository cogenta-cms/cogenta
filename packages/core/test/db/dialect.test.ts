import { describe, expect, it } from 'vitest'
import { compile, encodeValue, identifier, sql, unsafeRaw } from '../../src/db/dialect.js'
import type { DatabaseDialect } from '../../src/db/types.js'

const dialects: DatabaseDialect[] = ['postgres', 'mysql', 'sqlite']

describe('sql — building fragments', () => {
  it('binds interpolated values instead of inlining them', () => {
    const fragment = sql`select * from users where email = ${"bobby'; drop table users;--"}`

    expect(compile(fragment, 'postgres').text).toBe('select * from users where email = $1')
    expect(compile(fragment, 'postgres').params).toEqual(["bobby'; drop table users;--"])
  })

  it('numbers Postgres placeholders and leaves the others positional', () => {
    const fragment = sql`select ${1}, ${2}, ${3}`

    expect(compile(fragment, 'postgres').text).toBe('select $1, $2, $3')
    expect(compile(fragment, 'mysql').text).toBe('select ?, ?, ?')
    expect(compile(fragment, 'sqlite').text).toBe('select ?, ?, ?')
  })

  it('splices a nested fragment and keeps the placeholder numbering right', () => {
    const where = sql`status = ${'published'} and locale = ${'fr'}`
    const query = sql`select ${'id'} from articles where ${where} limit ${10}`

    const compiled = compile(query, 'postgres')
    expect(compiled.text).toBe('select $1 from articles where status = $2 and locale = $3 limit $4')
    expect(compiled.params).toEqual(['id', 'published', 'fr', 10])
  })

  it('inserts unsafeRaw text without binding it', () => {
    const fragment = sql`select * from ${unsafeRaw('articles')} where id = ${1}`

    expect(compile(fragment, 'sqlite').text).toBe('select * from articles where id = ?')
    expect(compile(fragment, 'sqlite').params).toEqual([1])
  })

  it('handles a fragment with no values at all', () => {
    expect(compile(sql`select 1`, 'postgres')).toEqual({ text: 'select 1', params: [] })
  })
})

describe('identifier — quoting', () => {
  it('uses the quoting each dialect expects', () => {
    expect(compile(identifier('articles', 'postgres'), 'postgres').text).toBe('"articles"')
    expect(compile(identifier('articles', 'sqlite'), 'sqlite').text).toBe('"articles"')
    expect(compile(identifier('articles', 'mysql'), 'mysql').text).toBe('`articles`')
  })

  it.each(['drop table x', 'a"b', 'a`b', '1abc', '', 'a;b', 'a b'])(
    'refuses %j rather than quoting something dangerous',
    (name) => {
      expect(() => identifier(name, 'postgres')).toThrowError()
    },
  )
})

describe('encodeValue — the differences that leak', () => {
  it('keeps booleans native on Postgres and turns them into integers elsewhere', () => {
    // SQLite has no boolean type at all, and MySQL stores tinyint(1).
    expect(encodeValue(true, 'postgres')).toBe(true)
    expect(encodeValue(true, 'sqlite')).toBe(1)
    expect(encodeValue(false, 'sqlite')).toBe(0)
    expect(encodeValue(true, 'mysql')).toBe(1)
  })

  it('writes dates in UTC in the shape each dialect understands', () => {
    const date = new Date('2026-08-13T10:20:30.000Z')

    expect(encodeValue(date, 'postgres')).toBe(date)
    expect(encodeValue(date, 'sqlite')).toBe('2026-08-13T10:20:30.000Z')
    // MySQL datetime carries no time zone, so it gets UTC rather than an offset
    // it would silently drop.
    expect(encodeValue(date, 'mysql')).toBe('2026-08-13 10:20:30')
  })

  it.each(dialects)('treats undefined as null on %s', (dialect) => {
    expect(encodeValue(undefined, dialect)).toBeNull()
  })

  it.each(dialects)('serialises objects and arrays as JSON on %s', (dialect) => {
    expect(encodeValue({ a: 1 }, dialect)).toBe('{"a":1}')
    expect(encodeValue([1, 2], dialect)).toBe('[1,2]')
  })

  it.each(dialects)('passes strings, numbers, null and buffers through on %s', (dialect) => {
    const buffer = Buffer.from([1, 2, 3])

    expect(encodeValue('text', dialect)).toBe('text')
    expect(encodeValue(42, dialect)).toBe(42)
    expect(encodeValue(null, dialect)).toBeNull()
    expect(encodeValue(buffer, dialect)).toBe(buffer)
  })

  it.each(dialects)('renders bigint as text on %s, since JSON and drivers lose it', (dialect) => {
    expect(encodeValue(9_007_199_254_740_993n, dialect)).toBe('9007199254740993')
  })
})
