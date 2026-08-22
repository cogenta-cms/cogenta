import {
  type DatabaseHandle,
  identifier,
  type SqlExecutor,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import { jsonColumn, textColumn, timestampColumn } from './columns.js'

/**
 * Theme overrides (fiche 14 task 0-4): the DB half of the two-source-of-truth
 * design the fiche's task 0 settles on. `theme.tokens.json` next to the
 * config stays the versioned default a project ships with; this table is
 * where a signed-in `admin` changes the live site's appearance without a
 * terminal, a redeploy, or a write to a source file the running process may
 * not even be allowed to touch (a read-only container filesystem, most
 * hosts). `cogenta serve` overlays this row on top of the file's tokens on
 * every request — see `theme-render.ts` — which is what makes a change show
 * up without a restart, the same promise contract D's hot-swappable skin
 * already made for the file alone.
 *
 * One row, updated in place — the same shape `MaintenanceState` already
 * uses: no locale, no version, no trash, because this is a feature flag's
 * worth of state, not content (contract A).
 *
 * `tokenOverrides` is a *partial* token tree (`SkinTokenOverrides` in
 * `@cogenta/render`) — only the keys an editor actually changed — kept as
 * opaque JSON here on purpose: this package does not depend on
 * `@cogenta/render`, so nothing here parses or validates the shape. That is
 * the caller's job (the theme router, with the real `validateSkin`), every
 * single time a value is about to be written or served — this store never
 * decides what a valid skin looks like, only where the bytes live.
 */

export const THEME_TABLE = 'cogenta_theme'

const ROW_ID = 'site'

export interface ThemeOverridesState {
  /** Partial token overlay (`SkinTokenOverrides`), or `null` when nothing has been overridden. */
  readonly tokenOverrides: Record<string, unknown> | null
  /** Extra CSS appended after the skin/theme sheets, or `null`. Never inlined as a `<style>` tag — see `theme-render.ts`. */
  readonly additionalCss: string | null
  readonly logoMediaId: string | null
  readonly logoDarkMediaId: string | null
  readonly faviconMediaId: string | null
  readonly shareImageMediaId: string | null
  /**
   * The installed theme *package* rendering the public site — a name like
   * `@cogenta/theme-portfolio`, resolved by `@cogenta/cli`'s theme registry
   * against the packages actually installed. `null` means the built-in
   * default (`@cogenta/theme-canonical`). Distinct from every field above,
   * which only ever changes *colours* within whichever theme is active — this
   * is the one field that changes which package renders the layout at all,
   * and it is read live on every request the same way the others are, so
   * switching it takes effect on the very next page view, no restart.
   */
  readonly activeTheme: string | null
  readonly updatedAt: string
  readonly updatedBy: string | null
}

export interface SetThemeOverridesInput {
  /** `undefined` leaves the field as it was; `null` clears it. */
  readonly tokenOverrides?: Record<string, unknown> | null
  readonly additionalCss?: string | null
  readonly logoMediaId?: string | null
  readonly logoDarkMediaId?: string | null
  readonly faviconMediaId?: string | null
  readonly shareImageMediaId?: string | null
  readonly activeTheme?: string | null
  readonly updatedBy?: string | null
}

export interface ThemeStoreOptions {
  readonly db: DatabaseHandle
  readonly now?: () => Date
}

export interface ThemeStore {
  get(): Promise<ThemeOverridesState>
  set(input: SetThemeOverridesInput): Promise<ThemeOverridesState>
  /** Clears every override in one call — the appearance screen's "reset to file" action. */
  clear(updatedBy: string | null): Promise<ThemeOverridesState>
}

const EMPTY_STATE: Omit<ThemeOverridesState, 'updatedAt'> = {
  tokenOverrides: null,
  additionalCss: null,
  logoMediaId: null,
  logoDarkMediaId: null,
  faviconMediaId: null,
  shareImageMediaId: null,
  activeTheme: null,
  updatedBy: null,
}

export async function ensureThemeTable(db: DatabaseHandle): Promise<void> {
  const dialect = db.dialect
  const table = identifier(THEME_TABLE, dialect)

  const statement: SqlFragment = sql`create table if not exists ${table} (
    ${identifier('id', dialect)} ${textColumn(dialect, 16)} not null primary key,
    ${identifier('token_overrides', dialect)} ${jsonColumn()},
    ${identifier('additional_css', dialect)} ${jsonColumn()},
    ${identifier('logo_media_id', dialect)} ${textColumn(dialect, 64)},
    ${identifier('logo_dark_media_id', dialect)} ${textColumn(dialect, 64)},
    ${identifier('favicon_media_id', dialect)} ${textColumn(dialect, 64)},
    ${identifier('share_image_media_id', dialect)} ${textColumn(dialect, 64)},
    ${identifier('active_theme', dialect)} ${textColumn(dialect, 200)},
    ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null,
    ${identifier('updated_by', dialect)} ${textColumn(dialect, 128)}
  )`
  await db.query(statement)

  // A database whose table predates `active_theme`: `create table if not
  // exists` above is a no-op for it, so the column is added the same way
  // every other in-place table growth in this codebase is
  // (`menu-tables.ts`'s own `location`/`target_taxonomy` columns do the
  // same). Failure here means the column already exists — the only realistic
  // cause on a table this function has already run against — so it is
  // swallowed exactly like that precedent.
  await db
    .query(
      sql`alter table ${table} add column ${identifier('active_theme', dialect)} ${textColumn(dialect, 200)}`,
    )
    .catch(() => undefined)
}

type Row = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value)
}

function nullableJson(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null
  const raw = text(value)
  if (raw === '') return null
  return JSON.parse(raw) as Record<string, unknown>
}

function toState(row: Row): ThemeOverridesState {
  return {
    tokenOverrides: nullableJson(row.token_overrides),
    additionalCss: nullableText(row.additional_css),
    logoMediaId: nullableText(row.logo_media_id),
    logoDarkMediaId: nullableText(row.logo_dark_media_id),
    faviconMediaId: nullableText(row.favicon_media_id),
    shareImageMediaId: nullableText(row.share_image_media_id),
    activeTheme: nullableText(row.active_theme),
    updatedAt: text(row.updated_at),
    updatedBy: nullableText(row.updated_by),
  }
}

export function createThemeStore(options: ThemeStoreOptions): ThemeStore {
  const { db } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())
  const table = identifier(THEME_TABLE, dialect)
  const idColumn = identifier('id', dialect)

  async function rowOf(tx: SqlExecutor): Promise<Row | null> {
    const found = await tx.query<Row>(sql`select * from ${table} where ${idColumn} = ${ROW_ID}`)
    return found.rows[0] ?? null
  }

  async function write(
    tx: SqlExecutor,
    existing: Row | null,
    next: {
      readonly tokenOverrides: Record<string, unknown> | null
      readonly additionalCss: string | null
      readonly logoMediaId: string | null
      readonly logoDarkMediaId: string | null
      readonly faviconMediaId: string | null
      readonly shareImageMediaId: string | null
      readonly activeTheme: string | null
      readonly updatedBy: string | null
    },
    at: string,
  ): Promise<ThemeOverridesState> {
    const tokenOverridesJson =
      next.tokenOverrides === null ? null : JSON.stringify(next.tokenOverrides)
    if (existing === null) {
      await tx.query(
        sql`insert into ${table} (
              ${idColumn}, ${identifier('token_overrides', dialect)}, ${identifier('additional_css', dialect)},
              ${identifier('logo_media_id', dialect)}, ${identifier('logo_dark_media_id', dialect)},
              ${identifier('favicon_media_id', dialect)}, ${identifier('share_image_media_id', dialect)},
              ${identifier('active_theme', dialect)},
              ${identifier('updated_at', dialect)}, ${identifier('updated_by', dialect)}
            ) values (
              ${ROW_ID}, ${tokenOverridesJson}, ${next.additionalCss},
              ${next.logoMediaId}, ${next.logoDarkMediaId},
              ${next.faviconMediaId}, ${next.shareImageMediaId},
              ${next.activeTheme},
              ${at}, ${next.updatedBy}
            )`,
      )
    } else {
      await tx.query(
        sql`update ${table}
            set ${identifier('token_overrides', dialect)} = ${tokenOverridesJson},
                ${identifier('additional_css', dialect)} = ${next.additionalCss},
                ${identifier('logo_media_id', dialect)} = ${next.logoMediaId},
                ${identifier('logo_dark_media_id', dialect)} = ${next.logoDarkMediaId},
                ${identifier('favicon_media_id', dialect)} = ${next.faviconMediaId},
                ${identifier('share_image_media_id', dialect)} = ${next.shareImageMediaId},
                ${identifier('active_theme', dialect)} = ${next.activeTheme},
                ${identifier('updated_at', dialect)} = ${at},
                ${identifier('updated_by', dialect)} = ${next.updatedBy}
            where ${idColumn} = ${ROW_ID}`,
      )
    }
    return {
      tokenOverrides: next.tokenOverrides,
      additionalCss: next.additionalCss,
      logoMediaId: next.logoMediaId,
      logoDarkMediaId: next.logoDarkMediaId,
      faviconMediaId: next.faviconMediaId,
      shareImageMediaId: next.shareImageMediaId,
      activeTheme: next.activeTheme,
      updatedAt: at,
      updatedBy: next.updatedBy,
    }
  }

  return {
    get: async () => {
      const row = await rowOf(db)
      if (row === null) return { ...EMPTY_STATE, updatedAt: now().toISOString() }
      return toState(row)
    },

    set: async (input) =>
      db.transaction(
        async (tx) => {
          const existing = await rowOf(tx)
          const current = existing === null ? { ...EMPTY_STATE, updatedAt: '' } : toState(existing)
          const at = now().toISOString()
          return write(
            tx,
            existing,
            {
              tokenOverrides:
                input.tokenOverrides === undefined ? current.tokenOverrides : input.tokenOverrides,
              additionalCss:
                input.additionalCss === undefined ? current.additionalCss : input.additionalCss,
              logoMediaId:
                input.logoMediaId === undefined ? current.logoMediaId : input.logoMediaId,
              logoDarkMediaId:
                input.logoDarkMediaId === undefined
                  ? current.logoDarkMediaId
                  : input.logoDarkMediaId,
              faviconMediaId:
                input.faviconMediaId === undefined ? current.faviconMediaId : input.faviconMediaId,
              shareImageMediaId:
                input.shareImageMediaId === undefined
                  ? current.shareImageMediaId
                  : input.shareImageMediaId,
              activeTheme:
                input.activeTheme === undefined ? current.activeTheme : input.activeTheme,
              updatedBy: input.updatedBy ?? null,
            },
            at,
          )
        },
        { immediate: true },
      ),

    clear: async (updatedBy) =>
      db.transaction(
        async (tx) => {
          const existing = await rowOf(tx)
          // `activeTheme` is deliberately *not* one of the fields this reset
          // touches: "reset to file" is the appearance screen's skin-only
          // undo, and it must not silently switch a site back to the
          // default theme as a side effect of an editor discarding their
          // colour changes.
          const activeTheme = existing === null ? null : toState(existing).activeTheme
          const at = now().toISOString()
          return write(
            tx,
            existing,
            {
              tokenOverrides: null,
              additionalCss: null,
              logoMediaId: null,
              logoDarkMediaId: null,
              faviconMediaId: null,
              shareImageMediaId: null,
              activeTheme,
              updatedBy,
            },
            at,
          )
        },
        { immediate: true },
      ),
  }
}
