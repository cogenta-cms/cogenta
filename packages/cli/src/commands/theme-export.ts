import { readdir, readFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { CogentaError } from '@cogenta/core'
import { createZipWriter, openZip } from '@cogenta/export'
import { createSandbox, writeSandboxFile } from './theme-sandbox.js'

/**
 * Fiche 73 task 8 — export/import (§ 3.7), the last piece: a theme leaves
 * and re-enters this mechanism as one portable file.
 *
 * Zero new dependency (R9): `@cogenta/export`'s `createZipWriter`/`openZip`
 * are the same zero-dependency, store-mode ZIP reader/writer `cogenta
 * backup` already uses — reused as-is, not reimplemented.
 */

/** Every real file under `dir`, as paths relative to it with forward slashes — the shape a ZIP entry name needs, on every platform. */
async function listFilesRecursive(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(dir.length + 1)
        .split(sep)
        .join('/'),
    )
}

export interface ExportThemeOptions {
  readonly projectRoot: string
  readonly themeName: string
  /** Called with each chunk of the archive, in order — an HTTP response, a file, or an in-memory collector, the caller's choice (same shape `createZipWriter` itself already takes). */
  readonly write: (chunk: Buffer) => Promise<void> | void
}

/** Zips `themes/<themeName>/` exactly as it sits on disk — every real file, store mode (no compression pass, same reasoning `zip-writer.ts` itself documents). Refuses a theme name with no matching folder rather than silently producing an empty archive. */
export async function exportThemeZip(options: ExportThemeOptions): Promise<void> {
  const themeDir = join(options.projectRoot, 'themes', options.themeName)
  let files: readonly string[]
  try {
    files = await listFilesRecursive(themeDir)
  } catch {
    throw new CogentaError({
      code: 'THEME_SANDBOX_SOURCE_NOT_FOUND',
      message: `No local theme named "${options.themeName}" exists in this project's themes/ folder to export.`,
      hint: 'Only a theme already present in themes/ can be exported.',
      details: { themeName: options.themeName },
    })
  }

  const writer = createZipWriter({ write: options.write })
  for (const file of files) {
    const content = await readFile(join(themeDir, file))
    await writer.addFile(file, content)
  }
  await writer.finish()
}

export interface ImportThemeZipOptions {
  readonly projectRoot: string
  /** Real path to the uploaded `.zip` on disk — the caller (an admin upload route, later) is responsible for getting the bytes there first. */
  readonly zipPath: string
  /** A sandbox id the caller already chose (or created) — `importThemeZip` creates the directory itself if it does not exist yet. */
  readonly sandboxId: string
}

/**
 * Extracts a theme archive into a sandbox — **never directly into
 * `themes/`**. This is the fiche's own "un import n'est jamais un
 * raccourci qui contourne la vérification" (§ 3.7), satisfied structurally
 * rather than by a second, zip-specific scan: every extracted entry goes
 * through `writeSandboxFile` (task 7), so an entry name that tries to
 * escape the sandbox (`../../.env`, an absolute path) is refused by the
 * exact same guard a hand-typed path from the AI agent already has to pass
 * — piège n°3 (§ 6), closed by reuse rather than a parallel implementation.
 * Deploying the result into `themes/<name>/` — where `verifyTheme`'s real
 * security scan actually runs — is a separate, explicit next step the
 * caller takes with `checkThemeDeployment`/`deployThemeFromSandbox` (task
 * 5), identical to any other sandbox: an imported theme gets no shortcut
 * past that gate.
 */
export async function importThemeZip(
  options: ImportThemeZipOptions,
): Promise<{ readonly sandboxId: string }> {
  await createSandbox(options.projectRoot, options.sandboxId)
  const reader = await openZip(options.zipPath)
  try {
    for (const entry of reader.entries) {
      const chunks: Buffer[] = []
      for await (const chunk of reader.read(entry.name)) chunks.push(chunk)
      await writeSandboxFile(
        options.projectRoot,
        options.sandboxId,
        entry.name,
        Buffer.concat(chunks),
      )
    }
  } finally {
    await reader.close()
  }
  return { sandboxId: options.sandboxId }
}
