import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createDefaultsPrompter, createInteractivePrompter } from '../src/prompts.js'

describe('createDefaultsPrompter', () => {
  it('answers every question with its default and never touches any stream', async () => {
    const prompter = createDefaultsPrompter()

    expect(await prompter.text('Site name', 'My Site')).toBe('My Site')
    expect(
      await prompter.choice(
        'Pick',
        [
          { label: 'a', value: 'a' },
          { label: 'b', value: 'b' },
        ],
        1,
      ),
    ).toBe('b')
    expect(await prompter.confirm('Sure?', true)).toBe(true)
    expect(() => prompter.close()).not.toThrow()
  })
})

describe('createInteractivePrompter', () => {
  function io(): { input: PassThrough; output: PassThrough; send: (line: string) => void } {
    const input = new PassThrough()
    const output = new PassThrough()
    output.on('data', () => {
      // Drain — the prompt text itself is not under test here.
    })
    return { input, output, send: (line) => input.write(`${line}\n`) }
  }

  it('falls back to the default on an empty answer', async () => {
    const { input, output, send } = io()
    const prompter = createInteractivePrompter({ input, output })

    const promise = prompter.text('Site name', 'My Site')
    send('')
    expect(await promise).toBe('My Site')
    prompter.close()
  })

  it('uses a trimmed typed answer over the default', async () => {
    const { input, output, send } = io()
    const prompter = createInteractivePrompter({ input, output })

    const promise = prompter.text('Site name', 'My Site')
    send('  Real Name  ')
    expect(await promise).toBe('Real Name')
    prompter.close()
  })

  it('resolves a numbered choice, defaulting on empty input', async () => {
    const { input, output, send } = io()
    const prompter = createInteractivePrompter({ input, output })
    const choices = [
      { label: 'blank', value: 'blank' },
      { label: 'blog', value: 'blog' },
    ]

    const promise = prompter.choice('Site type', choices, 0)
    send('2')
    expect(await promise).toBe('blog')
    prompter.close()
  })

  it('confirms yes/no, defaulting on empty input', async () => {
    const { input, output, send } = io()
    const prompter = createInteractivePrompter({ input, output })

    const promise = prompter.confirm('Sure?', false)
    send('y')
    expect(await promise).toBe(true)
    prompter.close()
  })
})
