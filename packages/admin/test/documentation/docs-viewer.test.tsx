import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DocsViewer } from '../../src/documentation/docs-viewer.js'

describe('documentation scroll regions', () => {
  it('updates labels without duplicating wrappers, and replaces old tables when content changes', () => {
    const html =
      '<table><thead><tr><th>Field</th></tr></thead><tbody><tr><td>Actual value</td></tr></tbody></table><pre><code>preserved code</code></pre>'
    const view = render(<DocsViewer html={html} title="First" />)
    const first = screen.getByRole('region', { name: 'Tableau 1 de First' })
    expect(first.tabIndex).toBe(0)
    view.rerender(<DocsViewer html={html} title="Renamed" />)
    const renamed = screen.getByRole('region', { name: 'Tableau 1 de Renamed' })
    expect(renamed.tabIndex).toBe(0)
    expect(screen.queryByRole('region', { name: 'Tableau 1 de First' })).toBeNull()
    expect(document.querySelectorAll('.doc-table-scroll')).toHaveLength(1)
    expect(screen.getByText('Actual value')).toBeDefined()
    expect(screen.getByRole('region', { name: 'Bloc de code 1 de Renamed' }).textContent).toBe(
      'preserved code',
    )
    view.rerender(<DocsViewer html="<p>Next document</p>" title="Next" />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('region')).toBeNull()
    expect(screen.getByText('Next document')).toBeDefined()
  })
})
