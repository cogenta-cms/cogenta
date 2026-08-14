import { describe, expect, it } from 'vitest'
import { bumpDependencyVersion } from '../../src/security/bump-version.js'

describe('bumpDependencyVersion', () => {
  it('replaces only the named dependency’s version, keeping formatting intact', () => {
    const content = ['{', '  "dependencies": {', '    "lodash": "4.17.15"', '  }', '}', ''].join(
      '\n',
    )

    const result = bumpDependencyVersion(content, 'lodash', '4.17.21')

    expect(result).toBe(
      ['{', '  "dependencies": {', '    "lodash": "4.17.21"', '  }', '}', ''].join('\n'),
    )
  })

  it('does not touch a similarly-named package', () => {
    const content = '{"dependencies": {"lodash": "4.17.15", "lodash.merge": "4.6.2"}}'

    const result = bumpDependencyVersion(content, 'lodash', '4.17.21')

    expect(result).toContain('"lodash.merge": "4.6.2"')
    expect(result).toContain('"lodash": "4.17.21"')
  })

  it('throws SECURITY_DEPENDENCY_NOT_FOUND when the package is not in the file', () => {
    expect(() => bumpDependencyVersion('{}', 'ghost', '1.0.0')).toThrowError(
      /"ghost" was not found/,
    )
  })
})
