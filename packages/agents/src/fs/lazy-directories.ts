import { mkdir } from 'node:fs/promises'

/**
 * Creates `dirs` the first time a file store actually needs them, and hands
 * every later call the same promise.
 *
 * Starting the `mkdir` at construction instead leaves a promise nobody awaits
 * until a method runs: if the directory cannot be created, that rejection is
 * unhandled, which terminates a Node process by default — for a store that
 * may never be used at all. Creating it on first use puts the failure where
 * someone is waiting for it. A failed attempt is forgotten, so a directory
 * that becomes creatable later (a volume mounted after start-up) works on the
 * next call rather than failing forever.
 */
export function lazyDirectories(...dirs: readonly string[]): () => Promise<void> {
  let pending: Promise<void> | undefined
  return () => {
    if (pending === undefined) {
      const attempt = Promise.all(dirs.map((dir) => mkdir(dir, { recursive: true }))).then(
        () => undefined,
      )
      pending = attempt
      attempt.catch(() => {
        if (pending === attempt) pending = undefined
      })
    }
    return pending
  }
}
