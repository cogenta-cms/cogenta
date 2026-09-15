import { authHeader, request } from './http.js'

/**
 * The fetch layer over `/api/widgets` (L30), hand-mirrored from
 * `@cogenta/widgets`' types the way every other client here mirrors its
 * router: this is a browser bundle, the store is a Node package.
 */

export type WidgetType =
  | 'text'
  | 'image'
  | 'gallery'
  | 'embed'
  | 'quote'
  | 'cta'
  | 'links'
  | 'contact'
  | 'about'
  | 'recentEntries'
  | 'relatedEntries'
  | 'popularEntries'
  | 'terms'
  | 'tagCloud'
  | 'archives'
  | 'recentComments'
  | 'search'
  | 'menu'
  | 'social'
  | 'form'
  | 'toc'
  | 'calendar'

export type PageTarget =
  | { readonly kind: 'home' }
  | {
      readonly kind: 'collection'
      readonly collection: string
      readonly entryIds?: readonly string[]
    }
  | { readonly kind: 'taxonomy'; readonly taxonomy: string; readonly termIds?: readonly string[] }
  | { readonly kind: 'dateArchive' }
  | { readonly kind: 'search' }
  | { readonly kind: 'path'; readonly path: string }

export interface WidgetVisibility {
  readonly pages: {
    readonly mode: 'all' | 'only' | 'except'
    readonly targets: readonly PageTarget[]
  }
  readonly audience: 'everyone' | 'visitors' | 'members'
  readonly devices: {
    readonly desktop: boolean
    readonly tablet: boolean
    readonly mobile: boolean
  }
  readonly from: string | null
  readonly until: string | null
  readonly locales: readonly string[]
}

export interface Widget {
  readonly id: string
  readonly area: string
  readonly position: number
  readonly type: WidgetType
  readonly title: string | null
  readonly settings: Readonly<Record<string, unknown>>
  readonly visibility: WidgetVisibility
  readonly enabled: boolean
  readonly createdAt: string
  readonly updatedAt: string
  readonly updatedBy: string | null
}

export interface WidgetArea {
  readonly id: string
  readonly label: string
  readonly description?: string
}

export interface WidgetsState {
  readonly areas: readonly WidgetArea[]
  readonly widgets: readonly Widget[]
  readonly types: readonly WidgetType[]
}

export interface WidgetInput {
  readonly title?: string | null
  readonly settings?: Readonly<Record<string, unknown>>
  readonly visibility?: WidgetVisibility
  readonly enabled?: boolean
}

const JSON_HEADERS = { 'content-type': 'application/json' }

export function getWidgets(token: string): Promise<WidgetsState> {
  return request('/api/widgets', { headers: authHeader(token) })
}

export function createWidget(
  token: string,
  input: WidgetInput & {
    readonly area: string
    readonly type: WidgetType
    readonly position?: number
  },
): Promise<Widget> {
  return request('/api/widgets', {
    method: 'POST',
    headers: { ...authHeader(token), ...JSON_HEADERS },
    body: JSON.stringify(input),
  })
}

export function updateWidget(token: string, id: string, input: WidgetInput): Promise<Widget> {
  return request(`/api/widgets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...authHeader(token), ...JSON_HEADERS },
    body: JSON.stringify(input),
  })
}

export function deleteWidget(token: string, id: string): Promise<null> {
  return request(`/api/widgets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export function moveWidget(
  token: string,
  id: string,
  area: string,
  position: number,
): Promise<Widget> {
  return request(`/api/widgets/${encodeURIComponent(id)}/move`, {
    method: 'POST',
    headers: { ...authHeader(token), ...JSON_HEADERS },
    body: JSON.stringify({ area, position }),
  })
}

export function duplicateWidget(token: string, id: string): Promise<Widget> {
  return request(`/api/widgets/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    headers: authHeader(token),
  })
}

export const DEFAULT_VISIBILITY: WidgetVisibility = {
  pages: { mode: 'all', targets: [] },
  audience: 'everyone',
  devices: { desktop: true, tablet: true, mobile: true },
  from: null,
  until: null,
  locales: [],
}
