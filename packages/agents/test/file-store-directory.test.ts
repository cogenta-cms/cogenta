import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFileAgentDeclarationStore } from '../src/agents/store.js'
import { createFileMemoryStore } from '../src/memory/file-store.js'
import { createFilePromptTemplateStore } from '../src/prompts/store.js'
import { createFileProviderConfigStore } from '../src/providers/store.js'
import { createFileSkillStore } from '../src/skills/file-store.js'
import { createFileAgentSkillStore } from '../src/skills/library.js'
import { createFileTraceStore } from '../src/trace/file-store.js'

/**
 * Every file-backed store of this package used to start `mkdir(dir)` the
 * moment it was constructed and only await that promise inside its methods.
 * A store nobody called yet therefore held a promise nobody was listening
 * to: when the directory could not be created (a path under a file, a
 * read-only mount, or — on a Windows CI runner — a temp directory a test's
 * cleanup removed while the mkdir was still queued), Node reported an
 * unhandled rejection, which kills a real `cogenta serve` process and fails
 * a Vitest run whose every test had passed.
 */

interface Case {
  readonly name: string
  /** Builds the store over `dir` and returns one call that has to touch that directory. */
  readonly firstUse: (dir: string) => Promise<unknown>
  readonly construct: (dir: string) => unknown
}

const SIGNING_KEY = 'a-test-signing-key-that-is-long-enough-for-derivation'

const CASES: readonly Case[] = [
  {
    name: 'agent declaration store',
    construct: (dir) => createFileAgentDeclarationStore({ dir }),
    firstUse: (dir) => createFileAgentDeclarationStore({ dir }).list(),
  },
  {
    name: 'memory store',
    construct: (dir) => createFileMemoryStore({ dir }),
    firstUse: (dir) => createFileMemoryStore({ dir }).query({ siteId: 'site' }),
  },
  {
    name: 'prompt template store',
    construct: (dir) => createFilePromptTemplateStore({ dir }),
    firstUse: (dir) => createFilePromptTemplateStore({ dir }).get('rewrite'),
  },
  {
    name: 'provider config store',
    construct: (dir) => createFileProviderConfigStore({ dir, signingKey: SIGNING_KEY }),
    firstUse: (dir) => createFileProviderConfigStore({ dir, signingKey: SIGNING_KEY }).list(),
  },
  {
    name: 'skill store',
    construct: (dir) => createFileSkillStore({ dir }),
    firstUse: (dir) => createFileSkillStore({ dir }).load('missing'),
  },
  {
    name: 'agent skill store',
    construct: (dir) => createFileAgentSkillStore({ dir }),
    firstUse: (dir) => createFileAgentSkillStore({ dir }).get('missing'),
  },
  {
    name: 'trace store',
    construct: (dir) => createFileTraceStore({ dir }),
    firstUse: (dir) => createFileTraceStore({ dir }).get('missing'),
  },
]

let root: string
/** A regular file: no directory can ever be created underneath it. */
let blocker: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cogenta-file-store-directory-'))
  blocker = join(root, 'not-a-directory')
  await writeFile(blocker, '')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Lets every queued filesystem callback and the rejection tracker run. */
async function settle(dir: string): Promise<void> {
  // The same mkdir the stores would have started, queued after theirs on the
  // same thread pool: once it has failed, theirs has had every chance to.
  await mkdir(dir, { recursive: true }).catch(() => undefined)
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

describe('a file store over a directory that cannot be created', () => {
  it('raises no unhandled rejection while nothing has used it yet', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      const dir = join(blocker, 'store')
      for (const entry of CASES) entry.construct(dir)
      await settle(dir)
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
    expect(unhandled).toEqual([])
  })

  for (const entry of CASES) {
    it(`${entry.name}: reports the unusable directory to the first call that needs it`, async () => {
      await expect(entry.firstUse(join(blocker, 'store'))).rejects.toThrow()
    })
  }

  it('creates the directory once it becomes possible, instead of failing forever', async () => {
    const dir = join(blocker, 'store')
    const store = createFilePromptTemplateStore({ dir })
    await expect(store.list()).rejects.toThrow()

    await rm(blocker)
    await mkdir(blocker)

    await expect(store.list()).resolves.toEqual([])
  })
})
