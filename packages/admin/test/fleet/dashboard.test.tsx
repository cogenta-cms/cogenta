import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FleetDashboard, type FleetSiteRisk } from '../../src/fleet/dashboard.js'

const SITES: readonly FleetSiteRisk[] = [
  {
    siteId: 'critical',
    siteName: 'zzz-critical-site',
    client: 'acme',
    score: 100,
    tier: 'critical',
  },
  { siteId: 'drifted', siteName: 'aaa-drifted-site', client: 'acme', score: 20, tier: 'medium' },
  { siteId: 'clean', siteName: 'globex-clean-site', client: 'globex', score: 0, tier: 'low' },
  { siteId: 'unlabeled', siteName: 'unlabeled-site', client: null, score: 5, tier: 'low' },
]

describe('FleetDashboard', () => {
  it('renders sites in the order given — never re-sorted alphabetically', () => {
    render(<FleetDashboard sites={SITES} />)
    const items = screen.getAllByRole('listitem').map((el) => el.textContent)
    // The highest-risk site (alphabetically last) still appears before the
    // lower-risk one that's alphabetically first — proves no re-sort.
    const criticalIndex = items.findIndex((text) => text?.includes('zzz-critical-site'))
    const driftedIndex = items.findIndex((text) => text?.includes('aaa-drifted-site'))
    expect(criticalIndex).toBeLessThan(driftedIndex)
  })

  it('filters by client', () => {
    render(<FleetDashboard sites={SITES} />)
    fireEvent.change(screen.getByLabelText(/Client/), { target: { value: 'globex' } })
    expect(screen.getByText(/globex-clean-site/)).not.toBeNull()
    expect(screen.queryByText(/zzz-critical-site/)).toBeNull()
  })

  it('filters by minimum risk tier', () => {
    render(<FleetDashboard sites={SITES} />)
    fireEvent.change(screen.getByLabelText(/Risque minimum|Minimum risk/), {
      target: { value: 'critical' },
    })
    expect(screen.getByText(/zzz-critical-site/)).not.toBeNull()
    expect(screen.queryByText(/aaa-drifted-site/)).toBeNull()
    expect(screen.queryByText(/globex-clean-site/)).toBeNull()
  })

  it('filters by search across site name and client', () => {
    render(<FleetDashboard sites={SITES} />)
    fireEvent.change(screen.getByLabelText(/Rechercher|Search/), { target: { value: 'acme' } })
    expect(screen.getByText(/zzz-critical-site/)).not.toBeNull()
    expect(screen.getByText(/aaa-drifted-site/)).not.toBeNull()
    expect(screen.queryByText(/globex-clean-site/)).toBeNull()
  })

  it('groups a null-client site under its own real group, never dropped', () => {
    render(<FleetDashboard sites={SITES} />)
    expect(screen.getByText(/unlabeled-site/)).not.toBeNull()
  })

  it('shows an empty state when no site matches the filters', () => {
    render(<FleetDashboard sites={SITES} />)
    fireEvent.change(screen.getByLabelText(/Rechercher|Search/), {
      target: { value: 'no-such-site' },
    })
    expect(screen.getByText(/Aucun site ne correspond|No site matches/)).not.toBeNull()
  })
})
