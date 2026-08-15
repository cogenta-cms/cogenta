import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PluginGrantedPermissions } from '../../src/plugins/granted-permissions.js'

const GRANTED = [
  {
    capability: 'content.read',
    sentence: 'Ce plugin pourra lire le contenu du site.',
    riskLevel: 'low' as const,
    grantedAt: '2026-01-01T00:00:00.000Z',
  },
]

const PENDING = [
  {
    capability: 'http.fetch:api.exemple.com',
    sentence: 'Ce plugin pourra envoyer des données à api.exemple.com.',
    riskLevel: 'medium' as const,
  },
]

describe('PluginGrantedPermissions', () => {
  it('renders only plain-language sentences for granted capabilities, never a raw capability string', () => {
    render(<PluginGrantedPermissions pluginName="mon-plugin" items={GRANTED} onRevoke={vi.fn()} />)
    expect(screen.getByText(/lire le contenu du site/)).not.toBeNull()
    expect(screen.queryByText('content.read')).toBeNull()
  })

  it('calls onRevoke with the exact capability string when revoked', () => {
    const onRevoke = vi.fn()
    render(<PluginGrantedPermissions pluginName="mon-plugin" items={GRANTED} onRevoke={onRevoke} />)
    fireEvent.click(screen.getByRole('button', { name: /Révoquer/ }))
    expect(onRevoke).toHaveBeenCalledWith('content.read')
  })

  it('shows an honest empty state when nothing is currently granted', () => {
    render(<PluginGrantedPermissions pluginName="mon-plugin" items={[]} onRevoke={vi.fn()} />)
    expect(screen.getByText(/aucune autorisation active/)).not.toBeNull()
  })

  it('renders no pending section when nothing needs re-approval', () => {
    render(<PluginGrantedPermissions pluginName="mon-plugin" items={GRANTED} onRevoke={vi.fn()} />)
    expect(screen.queryByText(/Nouvelles autorisations demandées/)).toBeNull()
  })

  it('renders pending capabilities in a clearly separated re-approval section', () => {
    const onApprovePending = vi.fn()
    render(
      <PluginGrantedPermissions
        pluginName="mon-plugin"
        items={GRANTED}
        pendingApproval={PENDING}
        onRevoke={vi.fn()}
        onApprovePending={onApprovePending}
      />,
    )
    expect(screen.getByText(/Nouvelles autorisations demandées/)).not.toBeNull()
    expect(screen.getByText(/envoyer des données à api\.exemple\.com/)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Tout autoriser sans les lire/ }))
    expect(onApprovePending).toHaveBeenCalledWith(['http.fetch:api.exemple.com'])
  })
})
