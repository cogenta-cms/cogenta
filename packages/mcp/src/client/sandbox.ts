import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Fiche 58 task 1bis: "`cwd`: <répertoire dédié à la connexion, vidé avant/
 * après>". A third-party `stdio` MCP server is spawned with this as its
 * working directory instead of `process.cwd()` (which, for `cogenta serve`,
 * is the site's own project root — secrets in `.env`, the schema, the
 * database file for the `sqlite` driver) — a relative-path read/write the
 * remote binary attempts lands in an empty scratch directory, not the site.
 *
 * Created fresh on connect and removed on close/dispose: nothing the remote
 * process wrote there survives past the connection it belongs to.
 */

export interface SandboxWorkDir {
  readonly path: string
  cleanup(): Promise<void>
}

export async function createSandboxWorkDir(
  prefix = 'cogenta-mcp-sandbox-',
): Promise<SandboxWorkDir> {
  const path = await mkdtemp(join(tmpdir(), prefix))
  return {
    path,
    async cleanup() {
      // `McpClient.close()` kills the child process but does not wait for
      // it to actually exit — on Windows specifically, the OS keeps a
      // spawned process's working directory locked for a short window
      // after `kill()` is issued, until the process has actually finished
      // tearing down. A bare `rm` right after `close()` can race that and
      // fail with `EBUSY`/`EPERM` — found for real running this package's
      // own end-to-end test against a genuinely spawned process (never
      // reproduced against the fake `spawnFn` this package's unit tests
      // use, which never holds a real OS handle on `path` at all).
      // `maxRetries`/`retryDelay` are `fs.rm`'s own documented answer to
      // exactly this Windows race, not a bespoke retry loop.
      await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    },
  }
}
