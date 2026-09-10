import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActivityLog, classifyActivityMessage } from '../../src/ui/index.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'

/**
 * The run log: the trace of a long agent job, kept readable once the job has
 * ended. Its whole reason to exist is that an operator can read back what
 * happened — so these tests are about what survives and what a screen reader
 * is told, not about markup.
 */

const LABELS = {
  title: 'Journal',
  running: 'En cours',
  done: 'Terminé',
  failed: 'Échec',
  empty: 'Rien pour l’instant.',
  show: 'Afficher',
  hide: 'Masquer',
  kinds: {
    thinking: 'Réflexion',
    'tool-start': "Appel d'outil",
    'tool-success': 'Outil terminé',
    'tool-failure': 'Échec',
    info: 'Information',
  },
} as const

describe('classifying one raw progress line', () => {
  it('reads a thinking step as thinking', () => {
    expect(classifyActivityMessage('Thinking… (step 3)').kind).toBe('thinking')
  })

  it('reads a tool call as a tool call, and names the tool', () => {
    const classified = classifyActivityMessage('Calling tool "theme.write_sandbox_file"…')
    expect(classified.kind).toBe('tool-start')
    expect(classified.tool).toBe('theme.write_sandbox_file')
  })

  it('reads a finished tool as a success', () => {
    expect(classifyActivityMessage('Tool "theme.propose_theme" finished.').kind).toBe(
      'tool-success',
    )
  })

  it('reads a failing tool as a failure even though the line also names the tool', () => {
    const classified = classifyActivityMessage('Tool "theme.write_sandbox_file" failed: nope.')
    expect(classified.kind).toBe('tool-failure')
    expect(classified.tool).toBe('theme.write_sandbox_file')
  })

  it('falls back to a neutral line rather than guessing success', () => {
    expect(classifyActivityMessage('Writing a custom layout into sandbox "gen-1".').kind).toBe(
      'info',
    )
  })
})

describe('the run log', () => {
  it('still shows every step once the run has ended', () => {
    render(
      <ActivityLog
        status="done"
        labels={LABELS}
        entries={[
          { id: '1', kind: 'thinking', message: 'Thinking… (step 1)' },
          { id: '2', kind: 'tool-failure', message: 'Tool "x" failed: nope.' },
        ]}
      />,
    )

    expect(screen.getByText('Thinking… (step 1)')).toBeDefined()
    expect(screen.getByText('Tool "x" failed: nope.')).toBeDefined()
    expect(screen.getByText('Terminé')).toBeDefined()
  })

  it('announces a failure in words, not only in colour', () => {
    render(
      <ActivityLog
        status="failed"
        labels={LABELS}
        entries={[{ id: '1', kind: 'tool-failure', message: 'Tool "x" failed: nope.' }]}
      />,
    )

    const line = screen.getByText('Tool "x" failed: nope.')
    expect(line.textContent).toContain('Échec : ')
  })

  it('collapses on demand and gives every step back when reopened', () => {
    render(
      <ActivityLog
        status="done"
        labels={LABELS}
        entries={[{ id: '1', kind: 'info', message: 'One step.' }]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Masquer' }))
    expect(screen.queryByText('One step.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Afficher' }))
    expect(screen.getByText('One step.')).toBeDefined()
  })

  it('says so rather than showing an empty box when the job has reported nothing yet', () => {
    render(<ActivityLog status="running" labels={LABELS} entries={[]} />)

    expect(screen.getByText('Rien pour l’instant.')).toBeDefined()
  })

  it('has no serious accessibility violation', async () => {
    const { container } = render(
      <ActivityLog
        status="running"
        labels={LABELS}
        entries={[
          { id: '1', kind: 'thinking', message: 'Thinking…', at: 1_767_225_600_000 },
          { id: '2', kind: 'tool-start', message: 'Calling tool "x"…', tool: 'x' },
        ]}
      />,
    )

    await expectNoSeriousA11yViolations(container)
  })
})
