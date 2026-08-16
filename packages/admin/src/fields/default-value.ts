import type { FieldKind } from '../schema/types.js'

/** A blank starting value per kind, so a new entry's form has something controlled to render from the first paint. */
export function defaultValueFor(kind: FieldKind): unknown {
  switch (kind) {
    case 'text':
    case 'slug':
    case 'date':
    case 'datetime':
    case 'color':
      return ''
    case 'number':
      return null
    case 'boolean':
      return false
    case 'select':
      return ''
    case 'json':
      return {}
    case 'geo':
      return null
    case 'richText':
    case 'media':
    case 'relation':
    case 'blocks':
      return null
    case 'taxonomy':
      // To-many by default (`schema@2.0`), and a join table's empty case is
      // `[]`, never null — the same rule the store applies.
      return []
  }
}
