import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

/**
 * L42: an administrator takes back what an autonomous MCP key did, from the
 * audit log. The button states — available, confirming, done, refused,
 * already undone — are the screen's whole contract; the server side is
 * proven on a real site in `packages/cli/test/serve-mcp-undo.test.ts`.
 */

const mcpEntry = {
  id: 'audit-mcp-1',
  at: '2026-03-04T10:00:00.000Z',
  actorId: 'apikey:key-1',
  actorRoles: ['editor'],
  action: 'agent.tool.content.publish',
  collection: 'article',
  entryId: 'entry-9',
  diff: {
    origin: 'mcp',
    tool: 'content.publish',
    ok: true,
    autonomyMode: 'autonomous',
    output: { id: 'entry-9', undo: { kind: 'unpublish' } },
  },
  version: null,
  hash: 'h1',
  previousHash: null,
}

const detailOf = (entry: Readonly<Record<string, unknown>>) => ({
  entry,
  actorKind: 'agent',
  actorLabel: 'Autonomous publisher',
  diff: null,
  diffUnavailable: 'first-version',
})

function signedInAsAdmin(options: Parameters<typeof installMockFetch>[0] = {}): void {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({
    roles: ['admin'],
    auditEntries: [mcpEntry],
    auditDetail: detailOf(mcpEntry),
    ...options,
  })
}

async function openDetail(): Promise<HTMLElement> {
  render(<App />)
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: "Journal d'audit" }))
  await screen.findByRole('heading', { name: "Journal d'audit" })
  const row = (await screen.findByTitle('entry-9')).closest('tr')
  if (row === null) throw new Error('the entry row is missing')
  fireEvent.click(within(row).getByRole('button', { name: 'Détail' }))
  return screen.findByRole('dialog')
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('undoing an MCP action from the audit log', () => {
  it('offers the button, asks for a confirmation in the page, then says the action was undone', async () => {
    signedInAsAdmin()
    const dialog = within(await openDetail())

    const button = await dialog.findByRole('button', { name: 'Annuler cette action' })
    fireEvent.click(button)

    // A confirmation in the page — no window.confirm — and nothing is undone yet.
    expect(dialog.getByText(/Le site reviendra à l'état d'avant cette action/u)).toBeDefined()
    expect(dialog.queryByText("L'action a été annulée.")).toBeNull()
    // Backing out leaves the entry as it was.
    fireEvent.click(dialog.getByRole('button', { name: "Garder l'action" }))
    expect(await dialog.findByRole('button', { name: 'Annuler cette action' })).toBeDefined()

    fireEvent.click(dialog.getByRole('button', { name: 'Annuler cette action' }))
    fireEvent.click(dialog.getByRole('button', { name: "Oui, annuler l'action" }))

    expect(await dialog.findByText("L'action a été annulée.")).toBeDefined()
    expect(dialog.queryByRole('button', { name: 'Annuler cette action' })).toBeNull()
  })

  it('shows the server refusal, with its hint, when the content changed since', async () => {
    signedInAsAdmin({
      mcpAction: {
        state: { state: 'available' },
        refusal: {
          status: 409,
          code: 'TOOL_REVERT_REFUSED',
          message:
            '"entry-9" was edited after it was published; the publication was left as it is.',
          hint: 'Review the entry and its history in the administration.',
        },
      },
    })
    const dialog = within(await openDetail())

    fireEvent.click(await dialog.findByRole('button', { name: 'Annuler cette action' }))
    fireEvent.click(dialog.getByRole('button', { name: "Oui, annuler l'action" }))

    expect(await dialog.findByText("L'action n'a pas été annulée.")).toBeDefined()
    expect(dialog.getByText(/was edited after it was published/u)).toBeDefined()
    expect(dialog.getByText(/Review the entry and its history/u)).toBeDefined()
    expect(dialog.queryByText("L'action a été annulée.")).toBeNull()
  })

  it('says "Annulée" and offers nothing for an entry already undone', async () => {
    signedInAsAdmin({
      mcpAction: {
        state: {
          state: 'reverted',
          revertedAt: '2026-03-04T11:00:00.000Z',
          revertAuditId: 'audit-undo-1',
          revertedBy: 'user-1',
        },
      },
    })
    const dialog = within(await openDetail())

    expect(await dialog.findByText('Annulée')).toBeDefined()
    expect(dialog.queryByRole('button', { name: 'Annuler cette action' })).toBeNull()
  })

  it('offers nothing for a call the server says cannot be undone', async () => {
    signedInAsAdmin({
      mcpAction: { state: { state: 'unavailable', reason: 'not-reversible' } },
    })
    const dialog = within(await openDetail())

    await dialog.findByText('alice@example.com').catch(() => undefined)
    await waitFor(() =>
      expect(dialog.queryByRole('button', { name: 'Annuler cette action' })).toBeNull(),
    )
    expect(dialog.queryByText('Annulée')).toBeNull()
  })

  it('does not even ask about an entry that is not an MCP call', async () => {
    const human = {
      ...mcpEntry,
      id: 'audit-human-1',
      actorId: 'user-1',
      action: 'content.update',
      diff: { title: 'x' },
    }
    signedInAsAdmin({ auditEntries: [human], auditDetail: detailOf(human) })
    const dialog = within(await openDetail())

    await dialog.findByText('Autonomous publisher').catch(() => undefined)
    expect(dialog.queryByRole('button', { name: 'Annuler cette action' })).toBeNull()
  })

  it('words an undo entry of the journal as an undo, not as an agent tool call', async () => {
    const undo = {
      ...mcpEntry,
      id: 'audit-undo-1',
      actorId: 'user-1',
      action: 'agent.tool.content.publish.revert',
      diff: { origin: 'mcp-undo', tool: 'content.publish', revertOf: 'audit-mcp-1', ok: true },
    }
    signedInAsAdmin({ auditEntries: [undo], auditDetail: detailOf(undo) })
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })
    fireEvent.click(await screen.findByRole('link', { name: "Journal d'audit" }))
    const table = within(await screen.findByRole('table'))

    expect(
      await table.findByText("Annulation d'une action d'agent : content.publish"),
    ).toBeDefined()
  })

  it('has no serious accessibility violation while confirming', async () => {
    signedInAsAdmin()
    const dialogElement = await openDetail()
    const dialog = within(dialogElement)
    fireEvent.click(await dialog.findByRole('button', { name: 'Annuler cette action' }))
    await dialog.findByRole('button', { name: "Oui, annuler l'action" })

    await expectNoSeriousA11yViolations(dialogElement)
  })
})
