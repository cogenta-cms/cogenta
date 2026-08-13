/** Where a command writes. Injected so tests read output instead of a stream. */
export type Writer = (text: string) => void

export interface Output {
  line(text?: string): void
  heading(text: string): void
  ok(text: string): void
  warn(text: string): void
  bad(text: string): void
  detail(text: string): void
}

/** Written as an escape, never as a literal control byte in the source. */
const ESC = '\u001B'

/**
 * Colour is opt-out through NO_COLOR and off whenever output is not a terminal,
 * so piping to a file or a CI log does not fill it with escape codes.
 */
export function createOutput(write: Writer, colour: boolean): Output {
  const paint = (code: string, text: string): string =>
    colour ? `${ESC}[${code}m${text}${ESC}[0m` : text

  return {
    line: (text = '') => {
      write(`${text}\n`)
    },
    heading: (text) => {
      write(`\n${paint('1', text)}\n`)
    },
    ok: (text) => {
      write(`  ${paint('32', '✓')} ${text}\n`)
    },
    warn: (text) => {
      write(`  ${paint('33', '!')} ${text}\n`)
    },
    bad: (text) => {
      write(`  ${paint('31', '✗')} ${text}\n`)
    },
    detail: (text) => {
      write(`      ${paint('2', text)}\n`)
    },
  }
}

export function shouldUseColour(env: Record<string, string | undefined>, isTty: boolean): boolean {
  const noColour = env.NO_COLOR
  const forceColour = env.FORCE_COLOR

  if (noColour !== undefined && noColour !== '') return false
  if (forceColour !== undefined && forceColour !== '') return true
  return isTty
}
