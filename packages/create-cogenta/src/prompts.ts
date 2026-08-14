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
