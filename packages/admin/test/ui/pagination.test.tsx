import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from '../../src/ui/index.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'

describe('Pagination, cursor variant', () => {
  it('renders nothing when no further page exists', () => {
    const { container } = render(
      <Pagination
        variant="cursor"
        hasMore={false}
        loading={false}
        onLoadMore={vi.fn()}
        loadMoreLabel="Load more"
      />,
    )
    expect(container.textContent).toBe('')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the load-more control and calls back when clicked', () => {
    const onLoadMore = vi.fn()
    render(
      <Pagination
        variant="cursor"
        hasMore
        loading={false}
        onLoadMore={onLoadMore}
        loadMoreLabel="Load more"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('disables the control while loading, keeping the same label with none supplied', () => {
    render(
      <Pagination
        variant="cursor"
        hasMore
        loading
        onLoadMore={vi.fn()}
        loadMoreLabel="Load more"
      />,
    )
    const button = screen.getByRole('button', { name: 'Load more' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('swaps in a loading label while loading, when the caller supplies one', () => {
    render(
      <Pagination
        variant="cursor"
        hasMore
        loading
        onLoadMore={vi.fn()}
        loadMoreLabel="Load more"
        loadingLabel="Loading…"
      />,
    )
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('refuses a click while loading', () => {
    const onLoadMore = vi.fn()
    render(
      <Pagination
        variant="cursor"
        hasMore
        loading
        onLoadMore={onLoadMore}
        loadMoreLabel="Load more"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(onLoadMore).not.toHaveBeenCalled()
  })
})

describe('Pagination, pages variant', () => {
  it('renders nothing with a single page — nothing to page between', () => {
    const { container } = render(
      <Pagination
        variant="pages"
        page={0}
        pageCount={1}
        onPageChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
      />,
    )
    expect(container.textContent).toBe('')
  })

  it('shows the page info the caller formatted, and both controls enabled mid-range', () => {
    render(
      <Pagination
        variant="pages"
        page={1}
        pageCount={3}
        onPageChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        pageInfo="26–50 of 62"
      />,
    )
    expect(screen.getByText('26–50 of 62')).toBeDefined()
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables "previous" on the first page and "next" on the last', () => {
    const { rerender } = render(
      <Pagination
        variant="pages"
        page={0}
        pageCount={3}
        onPageChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
      />,
    )
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false)

    rerender(
      <Pagination
        variant="pages"
        page={2}
        pageCount={3}
        onPageChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
      />,
    )
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      false,
    )
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls back with the adjacent page in either direction', () => {
    const onPageChange = vi.fn()
    render(
      <Pagination
        variant="pages"
        page={1}
        pageCount={3}
        onPageChange={onPageChange}
        previousLabel="Previous"
        nextLabel="Next"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPageChange).toHaveBeenLastCalledWith(2)
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(onPageChange).toHaveBeenLastCalledWith(0)
  })

  it('disables both controls while loading, even mid-range', () => {
    render(
      <Pagination
        variant="pages"
        page={1}
        pageCount={3}
        onPageChange={vi.fn()}
        loading
        previousLabel="Previous"
        nextLabel="Next"
      />,
    )
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Pagination, for accessibility', () => {
  it('has no serious accessibility violation in either variant', async () => {
    const { container: cursorContainer } = render(
      <Pagination
        variant="cursor"
        hasMore
        loading={false}
        onLoadMore={vi.fn()}
        loadMoreLabel="Load more"
      />,
    )
    await expectNoSeriousA11yViolations(cursorContainer)

    const { container: pagesContainer } = render(
      <Pagination
        variant="pages"
        page={0}
        pageCount={3}
        onPageChange={vi.fn()}
        previousLabel="Previous"
        nextLabel="Next"
        pageInfo="1–25 of 62"
      />,
    )
    await expectNoSeriousA11yViolations(pagesContainer)
  })
})
