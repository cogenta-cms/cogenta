import { createContext, type JSX, type ReactNode, useContext, useEffect, useState } from 'react'
import type { SchemaDocument } from './types.js'

const API_BASE = import.meta.env['VITE_API_BASE_URL'] ?? ''

export type SchemaState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly schema: SchemaDocument }
  | { readonly status: 'error'; readonly message: string }

const SchemaContext = createContext<SchemaState>({ status: 'loading' })

export function useSchema(): SchemaState {
  return useContext(SchemaContext)
}

/**
 * Fetches `/api/schema` once and holds it for the session — collections do
 * not change while the admin is open, so there is nothing to refetch or
 * invalidate.
 */
export function SchemaProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [state, setState] = useState<SchemaState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const response = await fetch(`${API_BASE}/api/schema`)
        if (!response.ok) {
          if (!cancelled) {
            setState({
              status: 'error',
              message: `Schema request failed with status ${response.status}.`,
            })
          }
          return
        }
        const body = (await response.json()) as { data: SchemaDocument }
        if (!cancelled) setState({ status: 'ready', schema: body.data })
      } catch (error) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Could not load the schema.',
          })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return <SchemaContext.Provider value={state}>{children}</SchemaContext.Provider>
}
