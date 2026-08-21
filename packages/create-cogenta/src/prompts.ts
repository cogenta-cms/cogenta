import { createInterface } from 'node:readline/promises'

export interface Choice<T> {
  readonly label: string
  readonly value: T
  readonly hint?: string
}

/**
 * Text/numbered-choice/confirm — the three primitives the wizard needs.
 * R9: audited against `@clack/prompts`/`prompts`/`enquirer` and built on
 * `node:readline/promises` instead — `prompts` and `enquirer` have had no
 * release in over two years, and `@clack/prompts`, while healthy, pulls
 * four more packages for what three functions here cover in well under a
 * hundred lines. No arrow-key navigation, but "type a number and press
 * Enter" is a completely standard, universally understood CLI pattern —
 * it does not put "moins de 60 secondes" at risk.
 */
export interface Prompter {
  text(question: string, defaultValue: string): Promise<string>
  /**
   * Like `text`, but for a value that must never be echoed back — an API
   * key typed at setup was showing in plaintext on screen (and staying in
   * the terminal's own scrollback) because it went through the same
   * `rl.question` as "Site name". Masks each keystroke with `*` on a real
   * TTY; on a non-TTY stream (a test's injected `PromptIO`, or input piped
   * from a file) there is no terminal to mask on, so it degrades to the
   * same unmasked read `text` already does — the value is still never
   * echoed by a caller that logs it, only by the terminal a human is
   * actually looking at.
   */
  secret(question: string): Promise<string>
  choice<T>(question: string, choices: readonly Choice<T>[], defaultIndex: number): Promise<T>
  confirm(question: string, defaultValue: boolean): Promise<boolean>
  close(): void
}

export interface PromptIO {
  readonly input: NodeJS.ReadableStream
  readonly output: NodeJS.WritableStream
}

/** Talks to a real terminal (or any injected stream pair, for tests that want to script real input). */
export function createInteractivePrompter(io: PromptIO): Prompter {
  const rl = createInterface({ input: io.input, output: io.output })

  return {
    async text(question, defaultValue) {
      const answer = await rl.question(`${question} (${defaultValue}): `)
      const trimmed = answer.trim()
      return trimmed === '' ? defaultValue : trimmed
    },
    async secret(question) {
      const isRealTty = 'isTTY' in io.input && (io.input as NodeJS.ReadStream).isTTY === true
      if (!isRealTty) {
        // No terminal to mask on — a test's injected stream, or input
        // piped from a file. The value is still never echoed by a caller
        // that logs it; only a real terminal's own character echo is what
        // this method exists to suppress.
        const answer = await rl.question(`${question}: `)
        return answer.trim()
      }
      // readline/promises has no built-in masked-input mode. The documented
      // workaround: intercept the Interface's own output-writing for the
      // duration of this one `question()` call, masking every character it
      // echoes back except the prompt itself and the trailing newline —
      // scoped to a single call on the SAME shared `rl`, never a second
      // `readline.Interface` on the same stream, which would fight this
      // one's listener state.
      type WithInternalWrite = { _writeToOutput(text: string): void }
      const withWrite = rl as unknown as WithInternalWrite
      const original = withWrite._writeToOutput.bind(rl)
      let promptWritten = false
      withWrite._writeToOutput = (text: string) => {
        if (!promptWritten) {
          original(text)
          promptWritten = text.endsWith(': ')
          return
        }
        original(text.replace(/[^\r\n]/g, '*'))
      }
      try {
        const answer = await rl.question(`${question}: `)
        return answer.trim()
      } finally {
        withWrite._writeToOutput = original
      }
    },
    async choice(question, choices, defaultIndex) {
      const fallback = choices[defaultIndex]
      if (fallback === undefined) {
        throw new RangeError(
          `defaultIndex ${defaultIndex} is out of range for ${choices.length} choices.`,
        )
      }
      const lines = choices.map((entry, index) => {
        const marker = index === defaultIndex ? '*' : ' '
        const hint = entry.hint === undefined ? '' : ` — ${entry.hint}`
        return `  ${marker} ${index + 1}. ${entry.label}${hint}`
      })
      const answer = await rl.question(
        `${question}\n${lines.join('\n')}\nChoice (${defaultIndex + 1}): `,
      )
      const trimmed = answer.trim()
      if (trimmed === '') return fallback.value
      const picked = Number.parseInt(trimmed, 10)
      const entry = choices[picked - 1]
      return entry === undefined ? fallback.value : entry.value
    },
    async confirm(question, defaultValue) {
      const suffix = defaultValue ? 'Y/n' : 'y/N'
      const answer = await rl.question(`${question} (${suffix}): `)
      const trimmed = answer.trim().toLowerCase()
      if (trimmed === '') return defaultValue
      return trimmed === 'y' || trimmed === 'yes'
    },
    close() {
      rl.close()
    },
  }
}

/** `--yes`: every question answers its own default, and stdin is never touched — this is what makes "nine Enters" and "zero Enters" the same outcome. */
export function createDefaultsPrompter(): Prompter {
  return {
    async text(_question, defaultValue) {
      return defaultValue
    },
    async secret(_question) {
      return ''
    },
    async choice(_question, choices, defaultIndex) {
      const fallback = choices[defaultIndex]
      if (fallback === undefined) {
        throw new RangeError(
          `defaultIndex ${defaultIndex} is out of range for ${choices.length} choices.`,
        )
      }
      return fallback.value
    },
    async confirm(_question, defaultValue) {
      return defaultValue
    },
    close() {
      // Nothing was opened.
    },
  }
}
