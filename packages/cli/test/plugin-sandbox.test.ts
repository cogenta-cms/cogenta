import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  checkPluginSandbox,
  createPluginSandbox,
  deployPluginFromSandbox,
  pluginSandboxDirectory,
  readPluginSandboxFile,
  writePluginSandboxFile,
} from '../src/commands/plugin-sandbox.js'

/**
 * L31 step 4: where a plugin is written before a site runs it, and what stops
 * what is written there from reaching the site by itself.
 */

async function project(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cogenta-plugin-sandbox-'))
}

describe('a plugin sandbox', () => {
  it('starts from a manifest and a handler that already validate', async () => {
    const root = await project()
    await createPluginSandbox(root, 'draft', { name: 'my-plugin' })

    const check = await checkPluginSandbox(root, 'draft')

    expect(check.ok).toBe(true)
    expect(check.manifest?.name).toBe('my-plugin')
    expect(check.handlers).toContain('onContentEvent')
  })

  it('refuses a path that leaves it, lexically or through a symlink', async () => {
    const root = await project()
    await createPluginSandbox(root, 'draft')

    await expect(writePluginSandboxFile(root, 'draft', '../escaped.js', 'x')).rejects.toThrow(
      CogentaError,
    )
    await expect(writePluginSandboxFile(root, 'draft', '/etc/passwd', 'x')).rejects.toThrow(
      CogentaError,
    )

    // A symlink inside the sandbox pointing out is caught on the real
    // filesystem, not merely by resolving the string.
    await symlink(root, join(pluginSandboxDirectory(root, 'draft'), 'out'), 'dir')
    await expect(writePluginSandboxFile(root, 'draft', 'out/escaped.js', 'x')).rejects.toThrow(
      CogentaError,
    )
  })

  it('names every reason a sandbox is not installable', async () => {
    const root = await project()
    await createPluginSandbox(root, 'draft')
    await writePluginSandboxFile(
      root,
      'draft',
      'plugin.manifest.mjs',
      `export default {
  name: 'broken',
  version: '1.0.0',
  engine: '^1.0.0',
  capabilities: ['agent.delegate'],
  provides: { routes: ['/hello'] },
  runtime: 'server',
  isolated: true,
}
`,
    )
    await writePluginSandboxFile(root, 'draft', 'plugin.js', '({ onContentEvent: () => 1 })')

    const check = await checkPluginSandbox(root, 'draft')

    expect(check.ok).toBe(false)
    // One nothing implements, and one the code does not back up.
    expect(check.unimplemented).toEqual(['agent.delegate'])
    expect(check.problems.join(' ')).toContain('agent.delegate')
    expect(check.problems.join(' ')).toContain('onRequest')
  })

  it('refuses to install a sandbox that does not check out', async () => {
    const root = await project()
    await createPluginSandbox(root, 'draft')
    await writePluginSandboxFile(root, 'draft', 'plugin.js', 'this is not javascript (')

    const deployment = await deployPluginFromSandbox(root, 'draft')

    expect(deployment.ok).toBe(false)
    expect(deployment.installedAt).toBeUndefined()
  })

  it('installs into plugins/, granting nothing, and keeps what it replaced', async () => {
    const root = await project()
    await createPluginSandbox(root, 'draft', { name: 'my-plugin' })
    await writePluginSandboxFile(
      root,
      'draft',
      'plugin.manifest.mjs',
      `export default {
  name: 'my-plugin',
  version: '1.0.0',
  engine: '^1.0.0',
  capabilities: ['content.read:article'],
  provides: { eventSubscriptions: ['content.publish'] },
  runtime: 'server',
  isolated: true,
}
`,
    )

    const first = await deployPluginFromSandbox(root, 'draft')
    expect(first.ok).toBe(true)
    expect(first.capabilities).toEqual(['content.read:article'])
    expect(await readFile(join(root, 'plugins', 'my-plugin', 'plugin.js'), 'utf8')).toContain(
      'onContentEvent',
    )

    // A second deploy does not silently replace what is installed…
    const refused = await deployPluginFromSandbox(root, 'draft')
    expect(refused.ok).toBe(false)
    expect(refused.problems.join(' ')).toContain('already installed')

    // …and when it is allowed to, the previous copy survives.
    await writePluginSandboxFile(root, 'draft', 'plugin.js', '({ onContentEvent: () => 2 })')
    const second = await deployPluginFromSandbox(root, 'draft', { overwrite: true })
    expect(second.ok).toBe(true)
    expect(second.backupAt).toBeDefined()
    expect(await readFile(join(second.backupAt as string, 'plugin.js'), 'utf8')).toContain(
      'onContentEvent',
    )
  })

  it('reads back what was written, and says so when a file is not there', async () => {
    const root = await project()
    await createPluginSandbox(root, 'draft')
    await writePluginSandboxFile(root, 'draft', 'lib/helper.js', '// helper')

    expect(await readPluginSandboxFile(root, 'draft', 'lib/helper.js')).toBe('// helper')
    await expect(readPluginSandboxFile(root, 'draft', 'nope.js')).rejects.toThrow(CogentaError)
  })
})
