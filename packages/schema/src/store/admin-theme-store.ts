import { CogentaError, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { ADMIN_THEME_SINGLETON_ID, ADMIN_THEME_TABLE } from './admin-theme-tables.js'
import {
  type AdminThemeOverrides,
  type AdminThemeTemplateId,
  adminThemeOverridesSchema,
  adminThemeTemplateById,
  DEFAULT_ADMIN_THEME_TEMPLATE_ID,
} from './admin-theme-templates.js'

export interface AdminThemeRecord {
  readonly templateId: AdminThemeTemplateId
  readonly overrides: AdminThemeOverrides
  readonly updatedAt: string
  readonly updatedBy: string | null
}

export interface AdminThemeStoreOptions {
  readonly db: DatabaseHandle
  readonly now?: () => Date
}

export interface AdminThemeStore {
  /** `null` when nobody has ever written a choice — the caller applies `DEFAULT_ADMIN_THEME_TEMPLATE_ID` with no overrides. */
  get(): Promise<AdminThemeRecord | null>
  /**
   * Refuses a `templateId` outside `ADMIN_THEME_TEMPLATES`
   * (`ADMIN_THEME_TEMPLATE_UNKNOWN`) or an override object that fails
   * `adminThemeOverridesSchema` (`ADMIN_THEME_INVALID`) — never a loose,
   * unvalidated blob written straight through.
   */
  set(templateId: string, overrides: unknown, updatedBy: string | null): Promise<AdminThemeRecord>
}

type Row = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value)
}

function unknownTemplate(templateId: string): CogentaError {
  return new CogentaError({
    code: 'ADMIN_THEME_TEMPLATE_UNKNOWN',
    message: `"${templateId}" is not a built-in admin theme template.`,
    hint: 'Choose one of the templates the admin theme gallery offers.',
    details: { templateId },
  })
}

function toRecord(row: Row): AdminThemeRecord {
  return {
    templateId: text(row['template_id']) as AdminThemeTemplateId,
    overrides: JSON.parse(text(row['overrides'])) as AdminThemeOverrides,
    updatedAt: text(row['updated_at']),
    updatedBy: nullableText(row['updated_by']),
  }
}

export function createAdminThemeStore(options: AdminThemeStoreOptions): AdminThemeStore {
  const { db } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())

  const table = identifier(ADMIN_THEME_TABLE, dialect)
  const idColumn = identifier('id', dialect)
  const templateIdColumn = identifier('template_id', dialect)
  const overridesColumn = identifier('overrides', dialect)
  const updatedAtColumn = identifier('updated_at', dialect)
  const updatedByColumn = identifier('updated_by', dialect)

  return {
    get: async () => {
      const found = await db.query<Row>(
        sql`select * from ${table} where ${idColumn} = ${ADMIN_THEME_SINGLETON_ID}`,
      )
      const row = found.rows[0]
      return row === undefined ? null : toRecord(row)
    },

    set: async (templateId, overrides, updatedBy) => {
      if (adminThemeTemplateById(templateId) === undefined) throw unknownTemplate(templateId)

      const parsed = adminThemeOverridesSchema.safeParse(overrides)
      if (!parsed.success) {
        throw new CogentaError({
          code: 'ADMIN_THEME_INVALID',
          message: `The admin theme overrides do not match the declared shape: ${parsed.error.issues
            .map((issue) => issue.message)
            .join('; ')}`,
          hint: 'Only the levers the admin theme settings screen offers may be set.',
          details: { issues: parsed.error.issues.map((issue) => issue.message) },
        })
      }

      const at = now().toISOString()
      const serialisedOverrides = JSON.stringify(parsed.data)

      await db.transaction(
        async (tx) => {
          const existing = await tx.query<Row>(
            sql`select ${idColumn} from ${table} where ${idColumn} = ${ADMIN_THEME_SINGLETON_ID}`,
          )
          if (existing.rows.length > 0) {
            await tx.query(
              sql`update ${table}
                  set ${templateIdColumn} = ${templateId}, ${overridesColumn} = ${serialisedOverrides},
                      ${updatedAtColumn} = ${at}, ${updatedByColumn} = ${updatedBy}
                  where ${idColumn} = ${ADMIN_THEME_SINGLETON_ID}`,
            )
          } else {
            await tx.query(
              sql`insert into ${table} (${idColumn}, ${templateIdColumn}, ${overridesColumn}, ${updatedAtColumn}, ${updatedByColumn})
                  values (${ADMIN_THEME_SINGLETON_ID}, ${templateId}, ${serialisedOverrides}, ${at}, ${updatedBy})`,
            )
          }
        },
        { immediate: true },
      )

      return {
        templateId: templateId as AdminThemeTemplateId,
        overrides: parsed.data,
        updatedAt: at,
        updatedBy,
      }
    },
  }
}

export { DEFAULT_ADMIN_THEME_TEMPLATE_ID }
