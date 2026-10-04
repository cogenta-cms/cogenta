import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentApprovals } from '../../src/agents/agent-approvals.js'
import type { AgentApprovalRequest } from '../../src/api/agent-approvals-client.js'
import { VALID_TOKEN } from '../helpers/mock-fetch.js'

const REQUEST: AgentApprovalRequest = {
  id: 'request/one',
  agentName: 'security',
  toolName: 'deps.patch',
  input: { package: 'example-package', version: '2.0.0' },
  requestedAt: '2026-10-03T10:30:00.000Z',
  status: 'pending',
}

function installTransport(
  options: { readonly loadError?: boolean; readonly decisionError?: boolean } = {},
) {
  let pending = true
  const decisions: { readonly url: string; readonly authorization: string | null }[] = []
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input)
      const isDecision = init?.method === 'POST'
      if (isDecision)
        decisions.push({ url, authorization: new Headers(init?.headers).get('authorization') })
      if ((isDecision && options.decisionError) || (!isDecision && options.loadError)) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'APPROVAL_UNAVAILABLE',
              message: 'La demande ne peut plus être traitée.',
            },
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        )
      }
      if (isDecision) pending = false
      return new Response(
        JSON.stringify({
          data: isDecision
            ? { ...REQUEST, status: url.endsWith('/approve') ? 'approved' : 'rejected' }
            : pending
              ? [REQUEST]
              : [],
        }),
        { headers: { 'content-type': 'application/json' } },
      )
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  return { decisions, fetchMock }
}

afterEach(() => vi.unstubAllGlobals())

describe('explicit approval of an agent action', () => {
  it('opens the review and cancels without sending any approval', async () => {
    const transport = installTransport()
    render(<AgentApprovals token={VALID_TOKEN} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Examiner l’action' }))
    const dialog = await screen.findByRole('dialog', { name: 'Autoriser cette action précise ?' })
    expect(within(dialog).getByText(/example-package/u)).toBeDefined()
    expect(transport.decisions).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(transport.decisions).toEqual([])
    expect(screen.getByRole('button', { name: 'Examiner l’action' })).toBeDefined()
  })

  it('approves only the reviewed request after the explicit confirmation', async () => {
    const transport = installTransport()
    render(<AgentApprovals token={VALID_TOKEN} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Examiner l’action' }))
    const dialog = await screen.findByRole('dialog')
    expect(transport.decisions).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Autoriser cette action' }))
    await screen.findByText('Aucune action en attente.')
    expect(transport.decisions).toEqual([
      { url: '/api/agent-approvals/request%2Fone/approve', authorization: `Bearer ${VALID_TOKEN}` },
    ])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('rejects the request without approving it or opening an approval dialog', async () => {
    const transport = installTransport()
    render(<AgentApprovals token={VALID_TOKEN} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Refuser' }))
    await screen.findByText('Aucune action en attente.')
    expect(transport.decisions).toEqual([
      { url: '/api/agent-approvals/request%2Fone/reject', authorization: `Bearer ${VALID_TOKEN}` },
    ])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the reviewed request when the API refuses its decision', async () => {
    const transport = installTransport({ decisionError: true })
    render(<AgentApprovals token={VALID_TOKEN} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Examiner l’action' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Autoriser cette action' }))
    expect(await screen.findByText('La demande ne peut plus être traitée.')).toBeDefined()
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(within(dialog).getByText(/example-package/u)).toBeDefined()
    expect(transport.decisions).toHaveLength(1)
    expect(
      (within(dialog).getByRole('button', { name: 'Autoriser cette action' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('shows a load error without sending a decision or fabricating a pending request', async () => {
    const transport = installTransport({ loadError: true })
    render(<AgentApprovals token={VALID_TOKEN} />)
    expect(await screen.findByText('La demande ne peut plus être traitée.')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Examiner l’action' })).toBeNull()
    expect(transport.decisions).toEqual([])
  })
})
