import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PluginPermissionReview } from '../../src/plugins/permission-review.js'

const ITEMS = [
  {
    capability: 'content.read',
    sentence: 'Ce plugin pourra lire le contenu du site.',
    riskLevel: 'low' as const,
  },
  {
    capability: 'content.publish',
    sentence: 'Ce plugin pourra publier du contenu directement, sans validation humaine préalable.',
    riskLevel: 'high' as const,
  },
]

describe('PluginPermissionReview', () => {
  it('renders only plain-language sentences, never a raw capability string', () => {
    render(<PluginPermissionReview pluginName="mon-plugin" items={ITEMS} onApprove={vi.fn()} />)

    expect(screen.getByText(/lire le contenu du site/)).not.toBeNull()
    expect(screen.queryByText('content.read')).toBeNull()
    expect(screen.queryByText('content.publish')).toBeNull()
  })

  it('disables "approve reviewed" until a checked high-risk item is explicitly confirmed', () => {
    const onApprove = vi.fn()
    render(<PluginPermissionReview pluginName="mon-plugin" items={ITEMS} onApprove={onApprove} />)

    const approveReviewed = screen.getByRole('button', { name: /Autoriser les permissions/ })
    expect(approveReviewed).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByLabelText(/publier du contenu directement/))
    expect(approveReviewed).toHaveProperty('disabled', true)

    fireEvent.click(screen.getByLabelText(/Je comprends et j'autorise/))
    expect(approveReviewed).toHaveProperty('disabled', false)

    fireEvent.click(approveReviewed)
    expect(onApprove).toHaveBeenCalledWith(['content.publish'])
  })

  it('"approve all" bypasses the checklist entirely — installing without reading stays possible', () => {
    const onApprove = vi.fn()
    render(<PluginPermissionReview pluginName="mon-plugin" items={ITEMS} onApprove={onApprove} />)

    fireEvent.click(screen.getByRole('button', { name: /Tout autoriser sans les lire/ }))
    expect(onApprove).toHaveBeenCalledWith(['content.read', 'content.publish'])
  })

  it('shows an honest empty state for a plugin requesting nothing', () => {
    render(<PluginPermissionReview pluginName="mon-plugin" items={[]} onApprove={vi.fn()} />)
    expect(
      screen.getByText('Ce plugin ne demande aucune autorisation particulière.'),
    ).not.toBeNull()
  })
})
