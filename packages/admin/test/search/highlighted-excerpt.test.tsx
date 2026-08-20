import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HighlightedExcerpt } from '../../src/search/highlighted-excerpt.js'

describe('HighlightedExcerpt', () => {
  it('wraps every match in a <mark>, and nothing else', () => {
    render(
      <HighlightedExcerpt
        text="Le vitrail restauré de la cathédrale"
        matches={[{ start: 11, end: 20 }]}
      />,
    )
    const mark = screen.getByText('restauré')
    expect(mark.tagName).toBe('MARK')
  })

  it('renders as plain text nodes, never as HTML — R3/R8', () => {
    const { container } = render(
      <HighlightedExcerpt
        text="Un commentaire dit : <script>alert(1)</script>"
        matches={[{ start: 22, end: 28 }]}
      />,
    )
    // The tag never became a real DOM element: there is exactly one <mark>,
    // and no <script> anywhere in the rendered tree.
    expect(container.querySelectorAll('script').length).toBe(0)
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })

  it('marks more than one match', () => {
    const { container } = render(
      <HighlightedExcerpt
        text="cathédrale cathédrale"
        matches={[
          { start: 0, end: 10 },
          { start: 11, end: 21 },
        ]}
      />,
    )
    expect(container.querySelectorAll('mark').length).toBe(2)
  })

  it('drops an out-of-bounds offset instead of throwing', () => {
    expect(() =>
      render(<HighlightedExcerpt text="short" matches={[{ start: 0, end: 999 }]} />),
    ).not.toThrow()
  })

  it('renders plain text with no matches at all', () => {
    const { container } = render(<HighlightedExcerpt text="no match here" matches={[]} />)
    expect(container.querySelectorAll('mark').length).toBe(0)
    expect(container.textContent).toBe('no match here')
  })
})
