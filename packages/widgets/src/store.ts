import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlExecutor,
  sql,
} from '@cogenta/core'
import { jsonColumn, textColumn, timestampColumn, uuidColumn } from '@cogenta/schema'
import { isWidgetAreaId } from './areas.js'
import { validateWidgetVisibility, type WidgetVisibility } from './visibility.js'
import { validateWidgetSettings, type WidgetType } from './vocabulary.js'

/**
 * The widgets of a site: one fixed table (`cogenta_widgets`), created and
 * edited at runtime from the admin, the same shape as the menus.
 *
 * Every write goes through the vocabulary's validation, so a stored widget
 * always renders. An area is a free key, not a foreign key to anything: a
 * widget whose area the active theme does not offer is kept, and the admin
 * lists it as inactive, the way WordPress keeps widgets across a theme switch.
 */

export const WIDGETS_TABLE = 'cogenta_widgets'

export interface Widget {
  readonly id: string
  readonly area: string
  /** 0-based order inside its area. */
  readonly position: number
  readonly type: WidgetType
  /** Shown above the widget; `null` for none. */
  readonly title: string | null
  readonly settings: Readonly<Record<string, unknown>>
  readonly visibility: WidgetVisibility
  /** `false`: hidden everywhere, kept with its settings. */
  readonly enabled: boolean
  readonly createdAt: string
  readonly updatedAt: string
  readonly updatedBy: string | null
}

export interface CreateWidgetInput {
  readonly id?: string
  readonly area: string
  readonly type: string
  readonly title?: string | null
  readonly settings?: unknown
  readonly visibility?: unknown
  readonly enabled?: boolean
  /** Inserted at this index of the area; appended when absent. */
  readonly position?: number
  readonly updatedBy?: string | null
}

export interface UpdateWidgetInput {
  readonly title?: string | null
  readonly settings?: unknown
  readonly visibility?: unknown
  readonly enabled?: boolean
  readonly updatedBy?: string | null
}

export interface WidgetStore {
  /** Every widget, or one area's, ordered by area then position. */
  list(options?: { readonly area?: string }): Promise<readonly Widget[]>
  read(id: string): Promise<Widget | null>
  create(input: CreateWidgetInput): Promise<Widget>
  update(id: string, input: UpdateWidgetInput): Promise<Widget>
  delete(id: string): Promise<boolean>
  /** Moves a widget to an index of an area (its own or another), closing the gap it leaves. */
  move(
    id: string,
    target: {
      readonly area: string
      readonly position: number
      readonly updatedBy?: string | null
    },
  ): Promise<Widget>
  /** Rewrites one area's order; `ids` must be exactly the area's widgets. */
  reorder(
    area: string,
    ids: readonly string[],
    updatedBy?: string | null,
  ): Promise<readonly Widget[]>
  /** A copy placed right after the original, hidden until someone shows it. */
  duplicate(id: string, updatedBy?: string | null): Promise<Widget>
  /** Removes every widget; for a site reset. Returns how many there were. */
  clear(): Promise<number>
}

export interface WidgetStoreOptions {
  readonly db: DatabaseHandle
  readonly now?: () => Date
  readonly newId?: () => string
}

export async function ensureWidgetTables(db: DatabaseHandle): Promise<void> {
  const dialect = db.dialect
  const table = identifier(WIDGETS_TABLE, dialect)
  await db.query(sql`create table if not exists ${table} (
    ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
    ${identifier('area', dialect)} ${textColumn(dialect, 64)} not null,
    ${identifier('position', dialect)} integer not null,
    ${identifier('type', dialect)} ${textColumn(dialect, 64)} not null,
    ${identifier('title', dialect)} ${textColumn(dialect, 255)},
    ${identifier('settings', dialect)} ${jsonColumn()} not null,
    ${identifier('visibility', dialect)} ${jsonColumn()} not null,
    ${identifier('enabled', dialect)} ${textColumn(dialect, 8)} not null,
    ${identifier('created_at', dialect)} ${timestampColumn(dialect)} not null,
    ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null,
    ${identifier('updated_by', dialect)} ${textColumn(dialect, 64)}
  )`)
  await db
    .query(
      sql`create index ${identifier('cogenta_widgets_area_position', dialect)} on ${table} (${identifier('area', dialect)}, ${identifier('position', dialect)})`,
    )
    .catch(() => undefined)
}

type Row = Record<string, unknown>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function areaInvalid(area: unknown): CogentaError {
  return new CogentaError({
    code: 'WIDGET_INVALID',
    message: `"${String(area)}" is not a widget area key.`,
    hint: 'An area key is lower case letters, digits and dashes, such as "sidebar" or "footer-1".',
    details: { area },
  })
}

function notFound(id: string): CogentaError {
  return new CogentaError({
    code: 'WIDGET_NOT_FOUND',
    message: `No widget "${id}".`,
    hint: 'It may already have been deleted. Reload the widget list.',
    details: { id },
  })
}

function titleOf(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  if (trimmed.length > 255) {
    throw new CogentaError({
      code: 'WIDGET_INVALID',
      message: 'A widget title is at most 255 characters.',
      hint: 'Shorten the title.',
    })
  }
  return trimmed.length === 0 ? null : trimmed
}

export function createWidgetStore(options: WidgetStoreOptions): WidgetStore {
  const { db } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())
  const mintId = options.newId ?? newId
  const table = identifier(WIDGETS_TABLE, dialect)
  const id = identifier('id', dialect)
  const area = identifier('area', dialect)
  const position = identifier('position', dialect)

  function toWidget(row: Row): Widget {
    return {
      id: text(row['id']),
      area: text(row['area']),
      position: Number(row['position']),
      type: text(row['type']) as WidgetType,
      title: row['title'] === null || row['title'] === undefined ? null : text(row['title']),
      settings: JSON.parse(text(row['settings'])) as Record<string, unknown>,
      visibility: JSON.parse(text(row['visibility'])) as WidgetVisibility,
      enabled: text(row['enabled']) === 'true',
      createdAt: text(row['created_at']),
      updatedAt: text(row['updated_at']),
      updatedBy:
        row['updated_by'] === null || row['updated_by'] === undefined
          ? null
          : text(row['updated_by']),
    }
  }

  async function rowOf(tx: SqlExecutor, widgetId: string): Promise<Row | null> {
    // Postgres types the column as `uuid` and refuses to compare it with any
    // other string, so an id that cannot exist is answered here, identically
    // on every dialect.
    if (!UUID.test(widgetId)) return null
    const found = await tx.query<Row>(sql`select * from ${table} where ${id} = ${widgetId}`)
    return found.rows[0] ?? null
  }

  async function areaIds(tx: SqlExecutor, areaKey: string, except?: string): Promise<string[]> {
    const found = await tx.query<Row>(
      sql`select ${id} from ${table} where ${area} = ${areaKey} order by ${position} asc, ${identifier('created_at', dialect)} asc`,
    )
    return found.rows.map((row) => text(row['id'])).filter((value) => value !== except)
  }

  /** Writes positions 0..n for the ids, in order, into the area. */
  async function writeOrder(
    tx: SqlExecutor,
    areaKey: string,
    ids: readonly string[],
    stamp: string,
    updatedBy: string | null,
    touched: string | null,
  ): Promise<void> {
    for (const [index, widgetId] of ids.entries()) {
      if (widgetId === touched) {
        await tx.query(
          sql`update ${table} set ${area} = ${areaKey}, ${position} = ${index}, ${identifier('updated_at', dialect)} = ${stamp}, ${identifier('updated_by', dialect)} = ${updatedBy} where ${id} = ${widgetId}`,
        )
      } else {
        await tx.query(sql`update ${table} set ${position} = ${index} where ${id} = ${widgetId}`)
      }
    }
  }

  const store: WidgetStore = {
    async list(listOptions) {
      const found =
        listOptions?.area === undefined
          ? await db.query<Row>(
              sql`select * from ${table} order by ${area} asc, ${position} asc, ${identifier('created_at', dialect)} asc`,
            )
          : await db.query<Row>(
              sql`select * from ${table} where ${area} = ${listOptions.area} order by ${position} asc, ${identifier('created_at', dialect)} asc`,
            )
      return found.rows.map(toWidget)
    },

    async read(widgetId) {
      const row = await rowOf(db, widgetId)
      return row === null ? null : toWidget(row)
    },

    create: (input) =>
      db.transaction(
        async (tx) => {
          if (!isWidgetAreaId(input.area)) throw areaInvalid(input.area)
          const settings = validateWidgetSettings(input.type, input.settings)
          const visibility = validateWidgetVisibility(input.visibility)
          const widgetId = input.id ?? mintId()
          if (!UUID.test(widgetId)) {
            throw new CogentaError({
              code: 'WIDGET_INVALID',
              message: `"${widgetId}" is not a widget id.`,
              hint: 'Leave the id out to have one minted, or pass a UUID.',
            })
          }
          const stamp = now().toISOString()
          const siblings = await areaIds(tx, input.area)
          const index =
            input.position === undefined
              ? siblings.length
              : Math.max(0, Math.min(siblings.length, Math.trunc(input.position)))
          await tx.query(sql`insert into ${table} (
            ${id}, ${area}, ${position}, ${identifier('type', dialect)}, ${identifier('title', dialect)},
            ${identifier('settings', dialect)}, ${identifier('visibility', dialect)}, ${identifier('enabled', dialect)},
            ${identifier('created_at', dialect)}, ${identifier('updated_at', dialect)}, ${identifier('updated_by', dialect)}
          ) values (
            ${widgetId}, ${input.area}, ${index}, ${input.type as string}, ${titleOf(input.title)},
            ${JSON.stringify(settings)}, ${JSON.stringify(visibility)}, ${String(input.enabled ?? true)},
            ${stamp}, ${stamp}, ${input.updatedBy ?? null}
          )`)
          const order = [...siblings]
          order.splice(index, 0, widgetId)
          await writeOrder(tx, input.area, order, stamp, input.updatedBy ?? null, null)
          const row = await rowOf(tx, widgetId)
          if (row === null) throw notFound(widgetId)
          return toWidget(row)
        },
        { immediate: true },
      ),

    update: (widgetId, input) =>
      db.transaction(
        async (tx) => {
          const row = await rowOf(tx, widgetId)
          if (row === null) throw notFound(widgetId)
          const current = toWidget(row)
          const settings =
            input.settings === undefined
              ? current.settings
              : validateWidgetSettings(current.type, input.settings)
          const visibility =
            input.visibility === undefined
              ? current.visibility
              : validateWidgetVisibility(input.visibility)
          const title = input.title === undefined ? current.title : titleOf(input.title)
          const enabled = input.enabled ?? current.enabled
          await tx.query(sql`update ${table} set
            ${identifier('title', dialect)} = ${title},
            ${identifier('settings', dialect)} = ${JSON.stringify(settings)},
            ${identifier('visibility', dialect)} = ${JSON.stringify(visibility)},
            ${identifier('enabled', dialect)} = ${String(enabled)},
            ${identifier('updated_at', dialect)} = ${now().toISOString()},
            ${identifier('updated_by', dialect)} = ${input.updatedBy ?? null}
            where ${id} = ${widgetId}`)
          const updated = await rowOf(tx, widgetId)
          if (updated === null) throw notFound(widgetId)
          return toWidget(updated)
        },
        { immediate: true },
      ),

    delete: (widgetId) =>
      db.transaction(
        async (tx) => {
          const row = await rowOf(tx, widgetId)
          if (row === null) return false
          await tx.query(sql`delete from ${table} where ${id} = ${widgetId}`)
          const areaKey = text(row['area'])
          await writeOrder(tx, areaKey, await areaIds(tx, areaKey), '', null, null)
          return true
        },
        { immediate: true },
      ),

    move: (widgetId, target) =>
      db.transaction(
        async (tx) => {
          if (!isWidgetAreaId(target.area)) throw areaInvalid(target.area)
          const row = await rowOf(tx, widgetId)
          if (row === null) throw notFound(widgetId)
          const from = text(row['area'])
          const stamp = now().toISOString()
          const destination = await areaIds(tx, target.area, widgetId)
          const index = Math.max(0, Math.min(destination.length, Math.trunc(target.position)))
          destination.splice(index, 0, widgetId)
          await writeOrder(tx, target.area, destination, stamp, target.updatedBy ?? null, widgetId)
          if (from !== target.area) {
            await writeOrder(tx, from, await areaIds(tx, from), stamp, null, null)
          }
          const moved = await rowOf(tx, widgetId)
          if (moved === null) throw notFound(widgetId)
          return toWidget(moved)
        },
        { immediate: true },
      ),

    reorder: (areaKey, ids, updatedBy) =>
      db.transaction(
        async (tx) => {
          if (!isWidgetAreaId(areaKey)) throw areaInvalid(areaKey)
          const current = await areaIds(tx, areaKey)
          const same =
            current.length === ids.length &&
            new Set(ids).size === ids.length &&
            ids.every((widgetId) => current.includes(widgetId))
          if (!same) {
            throw new CogentaError({
              code: 'WIDGET_INVALID',
              message: `A new order for "${areaKey}" must list exactly the widgets of that area, once each.`,
              hint: 'Reload the widget list: someone may have added or removed a widget meanwhile.',
              details: { area: areaKey, expected: current, received: ids },
            })
          }
          const stamp = now().toISOString()
          await writeOrder(tx, areaKey, ids, stamp, updatedBy ?? null, null)
          const found = await tx.query<Row>(
            sql`select * from ${table} where ${area} = ${areaKey} order by ${position} asc`,
          )
          return found.rows.map(toWidget)
        },
        { immediate: true },
      ),

    async duplicate(widgetId, updatedBy) {
      const original = await store.read(widgetId)
      if (original === null) throw notFound(widgetId)
      return store.create({
        area: original.area,
        type: original.type,
        title: original.title,
        settings: original.settings,
        visibility: original.visibility,
        enabled: false,
        position: original.position + 1,
        updatedBy: updatedBy ?? null,
      })
    },

    async clear() {
      const found = await db.query<Row>(sql`select count(*) as n from ${table}`)
      await db.query(sql`delete from ${table}`)
      return Number(found.rows[0]?.['n'] ?? 0)
    },
  }
  return store
}
