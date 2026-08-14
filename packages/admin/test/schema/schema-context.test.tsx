import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SchemaProvider, useSchema } from '../../src/schema/schema-context.js'
import { installMockFetch, MOCK_SCHEMA } from '../helpers/mock-fetch.js'

function Probe() {
  const state = useSchema()
  if (state.status === 'loading') return <p>loading</p>
  if (state.status === 'error') return <p role="alert">{state.message}</p>
  return <p>{state.schema.collections.length} collections</p>
}

beforeEach(() => {
  installMockFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SchemaProvider', () => {
  it('starts loading, then resolves with the fetched schema', async () => {
    render(
      <SchemaProvider>
        <Probe />
      </SchemaProvider>,
    )
    expect(await screen.findByText(`${MOCK_SCHEMA.collections.length} collections`)).toBeDefined()
  })

  it('reports a network failure as an error state, not an unhandled rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    )
    render(
      <SchemaProvider>
        <Probe />
      </SchemaProvider>,
    )
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'network down')
  })

  it('reports a non-OK response as an error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 500 }))),
    )
    render(
      <SchemaProvider>
        <Probe />
      </SchemaProvider>,
    )
    expect(await screen.findByRole('alert')).toBeDefined()
  })
})
