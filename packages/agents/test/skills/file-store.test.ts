import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFileSkillStore } from '../../src/skills/file-store.js'
import type { SkillStore } from '../../src/skills/types.js'

let dir: string
let store: SkillStore

async function writeSkill(
  name: string,
  fields: { readonly version: string; readonly description: string },
  body: string,
  resources: Readonly<Record<string, string>> = {},
): Promise<void> {
  const skillDir = join(dir, name)
  await mkdir(skillDir, { recursive: true })
  await writeFile(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\nversion: ${fields.version}\ndescription: ${fields.description}\n---\n${body}\n`,
    'utf8',
  )
  for (const [relativePath, content] of Object.entries(resources)) {
    const filePath = join(skillDir, relativePath)
    await mkdir(join(filePath, '..'), { recursive: true })
    await writeFile(filePath, content, 'utf8')
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cogenta-skills-'))
  store = createFileSkillStore({ dir })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createFileSkillStore', () => {
  it('lists every installed skill’s metadata, without reading instructions', async () => {
    await writeSkill('cve-triage', { version: '1.0.0', description: 'Triages a CVE.' }, 'Body.')
    await writeSkill(
      'security-report',
      { version: '2.1.0', description: 'Writes a report.' },
      'Body.',
    )

    const skills = await store.list()

    expect(skills).toEqual(
      expect.arrayContaining([
        { name: 'cve-triage', version: '1.0.0', description: 'Triages a CVE.' },
        { name: 'security-report', version: '2.1.0', description: 'Writes a report.' },
      ]),
    )
  })

  it('skips a folder with no valid SKILL.md rather than failing the whole listing', async () => {
    await writeSkill('cve-triage', { version: '1.0.0', description: 'Triages a CVE.' }, 'Body.')
    await mkdir(join(dir, 'not-a-skill'), { recursive: true })

    const skills = await store.list()

    expect(skills.map((s) => s.name)).toEqual(['cve-triage'])
  })

  it('loads a skill’s instructions and resource file names on demand', async () => {
    await writeSkill(
      'cve-triage',
      { version: '1.0.0', description: 'Triages a CVE.' },
      '# Instructions\n\nDo the thing.',
      { 'references/scoring.md': 'scoring notes', 'checklist.md': 'checklist' },
    )

    const skill = await store.load('cve-triage')

    expect(skill.name).toBe('cve-triage')
    expect(skill.instructions).toBe('# Instructions\n\nDo the thing.')
    expect([...skill.resources].sort()).toEqual(
      ['checklist.md', join('references', 'scoring.md')].sort(),
    )
  })

  it('throws SKILL_UNKNOWN when loading a name that was never installed', async () => {
    await expect(store.load('ghost')).rejects.toThrowError(/No skill named "ghost"/)
  })

  it('installs a skill by copying its folder in, keyed by its declared name', async () => {
    const sourceDir = await mkdtemp(join(tmpdir(), 'cogenta-skill-source-'))
    try {
      await mkdir(join(sourceDir, 'assets'), { recursive: true })
      await writeFile(
        join(sourceDir, 'SKILL.md'),
        '---\nname: cve-triage\nversion: 1.0.0\ndescription: Triages a CVE.\n---\nBody.\n',
        'utf8',
      )
      await writeFile(join(sourceDir, 'assets', 'template.md'), 'template', 'utf8')

      const metadata = await store.install(sourceDir)

      expect(metadata).toEqual({
        name: 'cve-triage',
        version: '1.0.0',
        description: 'Triages a CVE.',
      })
      const skill = await store.load('cve-triage')
      expect(skill.instructions).toBe('Body.')
      expect(skill.resources).toContain(join('assets', 'template.md'))
    } finally {
      await rm(sourceDir, { recursive: true, force: true })
    }
  })
})
