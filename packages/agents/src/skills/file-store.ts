import { cp, mkdir, readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { CogentaError } from '@cogenta/core'
import { parseSkillFile } from './frontmatter.js'
import type { Skill, SkillMetadata, SkillStore } from './types.js'

const SKILL_FILE = 'SKILL.md'

/**
 * A skill is a folder — `<dir>/<name>/SKILL.md` plus whatever resource files
 * sit alongside it — under `options.dir`. No external service (R1): this is
 * the whole store, the same "real but local" tier the trace/media file
 * stores already use. `list()` only reads each `SKILL.md`'s frontmatter, so
 * scanning many skills stays cheap; the (potentially large) instructions
 * body and resource file names are read only by `load()`, on demand.
 */
export function createFileSkillStore(options: { readonly dir: string }): SkillStore {
  const ready = mkdir(options.dir, { recursive: true })

  async function readSkillFile(name: string): Promise<{
    readonly metadata: SkillMetadata
    readonly instructions: string
  }> {
    const path = join(options.dir, name, SKILL_FILE)
    let raw: string
    try {
      raw = await readFile(path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new CogentaError({
          code: 'SKILL_UNKNOWN',
          message: `No skill named "${name}" (expected "${path}").`,
          hint: 'Install the skill first, or check the name against `list()`.',
        })
      }
      throw error
    }
    return parseSkillFile(path, raw)
  }

  return {
    async list() {
      await ready
      const entries = await readdir(options.dir, { withFileTypes: true }).catch(() => [])
      const skills: SkillMetadata[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        try {
          const { metadata } = await readSkillFile(entry.name)
          skills.push(metadata)
        } catch {
          // A folder without a valid SKILL.md is not a skill — skip it rather than fail the whole listing.
        }
      }
      return skills
    },

    async load(name) {
      await ready
      const { metadata, instructions } = await readSkillFile(name)
      const skillDir = join(options.dir, name)
      const allFiles = await readdir(skillDir, { withFileTypes: true, recursive: true })
      const resources = allFiles
        .filter((entry) => entry.isFile())
        .map((entry) => relative(skillDir, join(entry.parentPath, entry.name)))
        .filter((path) => path !== SKILL_FILE)

      const skill: Skill = { ...metadata, instructions, dir: skillDir, resources }
      return skill
    },

    async install(sourceDir) {
      await ready
      const raw = await readFile(join(sourceDir, SKILL_FILE), 'utf8')
      const { metadata } = parseSkillFile(join(sourceDir, SKILL_FILE), raw)
      await cp(sourceDir, join(options.dir, metadata.name), { recursive: true })
      return metadata
    },
  }
}
