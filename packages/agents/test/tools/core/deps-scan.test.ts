import { describe, expect, it } from 'vitest'
import { createDepsScanTool } from '../../../src/tools/core/deps-scan.js'
import type { ToolContext } from '../../../src/tools/types.js'

const CTX: ToolContext = {
  site: { name: 'acme', locales: ['en'], defaultLocale: 'en' },
  actor: { id: 'agent:security', roles: ['admin'] },
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
  signal: new AbortController().signal,
}

function fakePackageJson(content: unknown): (path: string) => Promise<string> {
  return async () => JSON.stringify(content)
}

describe('deps.scan', () => {
  it('flags a wildcard and a latest-tagged dependency, leaves pinned ones alone', async () => {
    const tool = createDepsScanTool({
      projectRoot: '/site',
      readFileImpl: fakePackageJson({
        dependencies: {
          '@cogenta/core': '^0.4.0',
          lodash: '*',
          left: 'latest',
        },
        devDependencies: {
          vitest: '~3.0.0',
        },
      }),
    })

    const output = await tool.execute({}, CTX)

    expect(output.totalDependencies).toBe(4)
    expect(output.unpinned).toEqual(
      expect.arrayContaining([
        { name: 'lodash', range: '*', kind: 'dependencies' },
        { name: 'left', range: 'latest', kind: 'dependencies' },
      ]),
    )
    expect(output.unpinned).toHaveLength(2)
  })

  it('treats workspace: ranges as pinned', async () => {
    const tool = createDepsScanTool({
      projectRoot: '/site',
      readFileImpl: fakePackageJson({ dependencies: { '@cogenta/schema': 'workspace:*' } }),
    })
    const output = await tool.execute({}, CTX)
    expect(output.unpinned).toEqual([])
  })

  it('reports no findings for a package.json with only pinned dependencies', async () => {
    const tool = createDepsScanTool({
      projectRoot: '/site',
      readFileImpl: fakePackageJson({ dependencies: { react: '19.0.0' } }),
    })
    const output = await tool.execute({}, CTX)
    expect(output.unpinned).toEqual([])
    expect(output.totalDependencies).toBe(1)
  })

  it('declares deps.scan permission and no side effects', () => {
    const tool = createDepsScanTool({ projectRoot: '/site' })
    expect(tool.permissions).toEqual(['deps.scan'])
    expect(tool.sideEffects).toBe(false)
  })
})
