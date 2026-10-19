import { describe, expect, it } from 'vitest'
import en from '../src/i18n/locales/en.json'
import fr from '../src/i18n/locales/fr.json'

const sources = import.meta.glob('../../api/src/notices/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Readonly<Record<string, string>>
function lookup(catalog: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (value, part) =>
        value !== null && typeof value === 'object'
          ? (value as Readonly<Record<string, unknown>>)[part]
          : undefined,
      catalog,
    )
}

describe('notice sources have complete user-facing translations', () => {
  it('covers every static emitted code and the declared variants in both languages', () => {
    const codes = new Set<string>([
      'plugin.disabled.timeout',
      'plugin.disabled.memory',
      'plugin.disabled.crash',
      'plugin.disabled.manual',
      'health.migrations-pending',
      'health.migrations-pending-destructive',
    ])
    const actions = new Set<string>()
    for (const source of Object.values(sources)) {
      if (!source.includes('): NoticeSource')) continue
      const constants = new Map(
        [...source.matchAll(/const (\w+) = '([^']+)'/gu)].map((match) => [match[1], match[2]]),
      )
      for (const match of source.matchAll(/code:\s*(?:'([^']+)'|(\w+))/gu)) {
        const code = match[1] ?? constants.get(match[2])
        if (code === undefined) continue
        if (code.endsWith('.action')) actions.add(code)
        else codes.add(code)
      }
    }
    expect(codes.size).toBeGreaterThan(9)
    for (const [locale, catalog] of [
      ['fr', fr],
      ['en', en],
    ] as const) {
      for (const code of codes)
        for (const suffix of ['title', 'body']) {
          expect(
            lookup(catalog, `notices.${code}.${suffix}`),
            `${locale}: ${code}.${suffix}`,
          ).toBeTypeOf('string')
        }
      for (const action of actions)
        expect(lookup(catalog, `notices.${action}`), `${locale}: ${action}`).toBeTypeOf('string')
    }
  })
})
