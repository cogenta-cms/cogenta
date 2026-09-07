// Documents the honest gap `runIsolatedModule`'s own doc comment names: a
// real `import()`, unlike `runIsolated`'s import-less `vm.Script`, has no
// boundary stopping `node:fs` from loading — this fixture WOULD reach the
// real filesystem if `runIsolatedModule` were the only protection a theme
// ever got. It is exactly the class of import `verifyTheme`'s static scan
// (task 1) already refuses before a theme's own source ever reaches a
// worker like this one.
import { readFileSync } from 'node:fs'

export function readPackageJson(path) {
  return { content: readFileSync(path, 'utf8').slice(0, 40) }
}
