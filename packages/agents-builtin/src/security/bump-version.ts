import { CogentaError } from '@cogenta/core'

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * A targeted string replace, not a JSON parse/re-stringify — a real
 * `package.json` has formatting (indentation, key order, trailing newline)
 * a round trip through `JSON.stringify` would blow away, turning a
 * one-line security fix into a noisy, hard-to-review diff.
 */
export function bumpDependencyVersion(
  fileContent: string,
  packageName: string,
  newVersion: string,
): string {
  const pattern = new RegExp(`("${escapeRegExp(packageName)}"\\s*:\\s*")([^"]+)(")`)
  if (!pattern.test(fileContent)) {
    throw new CogentaError({
      code: 'SECURITY_DEPENDENCY_NOT_FOUND',
      message: `"${packageName}" was not found in the given dependency file.`,
      hint: 'Check the package name and that the right file content was passed.',
    })
  }
  return fileContent.replace(pattern, `$1${newVersion}$3`)
}
