import { describe, expect, it } from 'vitest'
import en from '../src/i18n/locales/en.json'
import fr from '../src/i18n/locales/fr.json'

/**
 * "{{count}} entrée(s)" is not a plural, it is a way of not choosing one. It
 * reads as unfinished in French and in English alike, and i18next has had the
 * real thing all along: a `_one`/`_other` pair, chosen from a `count`
 * variable, per language and per CLDR rule.
 *
 * This list is the strings that still fake it. It exists so the number can
 * only go down: a key that leaves a locale must leave this list too, and a new
 * one cannot be added without someone editing this file and reading this
 * comment. Several of the entries below need more than a `_one`/`_other`
 * split — a sentence counting two different things ("{{created}} créé(s),
 * {{failed}} échec(s)") has to be reworded first, since i18next pluralises on
 * exactly one variable.
 */
const FAKE_PLURALS_STILL_TO_FIX = [
  'apiKeys.expiresInDays',
  'apiKeys.gracePeriodUntil',
  'apiKeys.purgeIn',
  'apiKeys.rotatedBody',
  'appearance.sampleData.warnings.entries-failed',
  'appearance.sampleData.warnings.menu-merged',
  'appearance.sampleData.warnings.slug-conflict',
  'assistant.usageRow',
  'assistantIndex.statusIndexed',
  'blockValidation.more',
  'blockValidation.tooFew',
  'blockValidation.tooMany',
  'builder.copiedNotice',
  'builder.selectionCount',
  'commerceCoupons.restrictedLabel',
  'commerceProducts.importResultSummary',
  'commerceSubscriptions.dunningInProgress',
  'fields.repeaterMax',
  'fields.repeaterMin',
  'formSubmissions.gdprErased',
  'formSubmissions.selectedCount',
  'globalSearch.actions.create',
  'health.applyResult',
  'health.destructiveNotice',
  'health.driversIntro',
  'health.migrationsSummary',
  'mcpClients.toolsCount',
  'media.bulkDeleteConfirmTitle',
  'media.bulkReportSummary',
  'media.deleteUsageWarning',
  'media.selectedCount',
  'menus.problemsTitle',
  'notices.apikey.expiring.body',
  'notices.health.migrations-pending-destructive.body',
  'notices.health.migrations-pending.body',
  'notices.security.suspicious-activity.body',
  'profile.passwordStrengthShort',
  'profile.sessionsRevokedOthers',
  'resetPassword.strengthShort',
  'rolesMatrix.anomalyUnknownRoleInUse',
  'seo.noindexCount',
  'sitePlan.appliedSummary',
  'sitePlan.uploadLabel',
  'themeGenerator.candidateFilesWritten',
  'users.bulkPartialFailure',
]

const FAKE_PLURAL = /\((?:s|e|es|ne|y\/ies)\)/u

function fakePluralPaths(node: unknown, prefix: string, into: Set<string>): void {
  if (typeof node === 'string') {
    if (FAKE_PLURAL.test(node)) into.add(prefix)
    return
  }
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    fakePluralPaths(value, prefix ? `${prefix}.${key}` : key, into)
  }
}

describe('plural forms', () => {
  it('has no parenthesised plural beyond the ones already listed', () => {
    const found = new Set<string>()
    fakePluralPaths(fr, '', found)
    fakePluralPaths(en, '', found)

    const known = new Set(FAKE_PLURALS_STILL_TO_FIX)
    const added = [...found].filter((path) => !known.has(path)).sort()
    const fixed = [...known].filter((path) => !found.has(path)).sort()

    expect(
      added,
      `these strings fake a plural with "(s)". Give the key a _one/_other pair and pass \`count\`: ${added.join(', ')}`,
    ).toEqual([])
    expect(
      fixed,
      `these are fixed — delete them from FAKE_PLURALS_STILL_TO_FIX: ${fixed.join(', ')}`,
    ).toEqual([])
  })

  it('pluralises the counts an editor sees most often', () => {
    // The six the audit caught on screen: "1 entrées", "0 résultat(s)",
    // "Mettre 2 entrée(s) à la corbeille ?", "0 vue(s)", "47 mot(s)".
    for (const locale of [fr, en]) {
      for (const [section, key] of [
        ['fields', 'wordCount'],
        ['richText', 'wordCount'],
        ['richText', 'characterCount'],
        ['collectionList', 'searchResults'],
        ['collectionList', 'bulkTrashConfirmTitle'],
        ['taxonomies', 'entryCount'],
        ['entryEdit', 'analyticsViews'],
      ] as const) {
        const group = locale[section] as Record<string, string | undefined>
        expect(group[`${key}_one`], `${section}.${key}_one`).toBeDefined()
        expect(group[`${key}_other`], `${section}.${key}_other`).toBeDefined()
        expect(group[key], `${section}.${key} should be gone, replaced by the pair`).toBeUndefined()
      }
    }
  })
})
