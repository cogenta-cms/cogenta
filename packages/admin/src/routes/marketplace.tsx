import type { TFunction } from 'i18next'
import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  activateMarketplaceItem,
  applyMarketplaceUpdates,
  deactivateMarketplaceItem,
  getMarketplaceItem,
  getMarketplaceUpdates,
  installMarketplaceItem,
  listInstalledMarketplaceItems,
  listMarketplaceItems,
  type MarketplaceApplyUpdatesResult,
  type MarketplaceCapabilityItem,
  type MarketplaceCatalogItem,
  type MarketplaceInstalledItem,
  type MarketplaceItemDetail,
  type MarketplaceItemKind,
  type MarketplaceUpdatesSummary,
  uninstallMarketplaceItem,
  updateMarketplaceItem,
} from '../api/marketplace-client.js'
import { useAuth } from '../auth/auth-context.js'
import { PluginPermissionReview } from '../plugins/permission-review.js'
import { relativeTime } from '../trash/date-format.js'
import {
  Button,
  Field,
  Input,
  Modal,
  Notice,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

type MarketplaceTab = 'installed' | 'discover'

function statusLabel(
  item: MarketplaceInstalledItem,
  t: TFunction,
): { readonly label: string; readonly tone: 'success' | 'warning' | 'danger' } {
  if (item.disabled !== null) {
    return {
      label: t(`marketplace.installed.autoDisabledReason.${item.disabled.reason}`),
      tone: 'danger',
    }
  }
  if (!item.enabled) return { label: t('marketplace.installed.statusDisabled'), tone: 'warning' }
  return { label: t('marketplace.installed.statusActive'), tone: 'success' }
}

/**
 * L17 — the marketplace's admin screens, the last missing piece of a
 * backend that was already complete (`@cogenta/api`'s
 * `marketplace-router.ts`, `@cogenta/plugins`' `createMarketplaceInstaller`).
 *
 * Three rules this screen exists to keep visible, never silent:
 *  1. What runs the moment "Install" is pressed is real code — the
 *     capability list shown just before it comes straight from
 *     `PluginPermissionReview` (L7 task 7), reused rather than duplicated.
 *  2. A signature refusal (`PLUGIN_SIGNATURE_INVALID`/`PLUGIN_SIGNATURE_MISSING`,
 *     surfaced by the server as a 422) is shown as a clear failure, never
 *     folded into a generic error banner that could read as "something else
 *     went wrong, try again".
 *  3. An update that would widen permissions never applies on the first
 *     click: the server's `409 MARKETPLACE_UPDATE_REQUIRES_APPROVAL`
 *     produces its own confirmation step here — through the same
 *     `PluginPermissionReview` — before a second, explicit call re-sends the
 *     request with `confirmPendingPermissions: true`. `CogentaError.details`
 *     (where the server computes the exact newly-requested capabilities) is
 *     deliberately never sent to a client, so this shows the new version's
 *     full requested capability set rather than a byte-exact delta — real
 *     server data either way, and never a silent apply.
 */
export function MarketplaceRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [activeTab, setActiveTab] = useState<MarketplaceTab>('installed')

  const [installedItems, setInstalledItems] = useState<readonly MarketplaceInstalledItem[]>([])
  const [installedLoading, setInstalledLoading] = useState(true)
  const [installedError, setInstalledError] = useState<string | null>(null)
  const [updatesSummary, setUpdatesSummary] = useState<MarketplaceUpdatesSummary | null>(null)
  const [rowOutcome, setRowOutcome] = useState<{
    readonly itemId: string
    readonly tone: 'success' | 'danger'
    readonly message: string
  } | null>(null)
  const [confirmUninstall, setConfirmUninstall] = useState<{
    readonly itemId: string
    readonly displayName: string
    readonly removeData: boolean
  } | null>(null)
  const [applyingUpdates, setApplyingUpdates] = useState(false)
  const [applyResult, setApplyResult] = useState<MarketplaceApplyUpdatesResult | null>(null)

  const loadInstalled = useCallback(async () => {
    if (token === null || !isAdmin) return
    setInstalledLoading(true)
    setInstalledError(null)
    try {
      const [installed, updates] = await Promise.all([
        listInstalledMarketplaceItems(token),
        getMarketplaceUpdates(token),
      ])
      setInstalledItems(installed)
      setUpdatesSummary(updates)
    } catch (caught) {
      setInstalledError(
        caught instanceof ApiError ? caught.message : t('marketplace.installed.loadError'),
      )
    } finally {
      setInstalledLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    if (activeTab === 'installed') void loadInstalled()
  }, [activeTab, loadInstalled])

  async function toggleEnabled(item: MarketplaceInstalledItem): Promise<void> {
    if (token === null) return
    setRowOutcome(null)
    try {
      if (item.enabled) await deactivateMarketplaceItem(token, item.itemId)
      else await activateMarketplaceItem(token, item.itemId)
      await loadInstalled()
    } catch (caught) {
      setRowOutcome({
        itemId: item.itemId,
        tone: 'danger',
        message:
          caught instanceof ApiError ? caught.message : t('marketplace.installed.toggleError'),
      })
    }
  }

  async function confirmUninstallAction(): Promise<void> {
    if (token === null || confirmUninstall === null) return
    try {
      await uninstallMarketplaceItem(token, confirmUninstall.itemId, {
        removeData: confirmUninstall.removeData,
      })
      setConfirmUninstall(null)
      await loadInstalled()
    } catch (caught) {
      setRowOutcome({
        itemId: confirmUninstall.itemId,
        tone: 'danger',
        message:
          caught instanceof ApiError ? caught.message : t('marketplace.installed.uninstallError'),
      })
      setConfirmUninstall(null)
    }
  }

  async function applyAllUpdates(): Promise<void> {
    if (token === null) return
    setApplyingUpdates(true)
    setApplyResult(null)
    try {
      setApplyResult(await applyMarketplaceUpdates(token))
      await loadInstalled()
    } catch (caught) {
      setRowOutcome({
        itemId: '*',
        tone: 'danger',
        message:
          caught instanceof ApiError ? caught.message : t('marketplace.installed.updateError'),
      })
    } finally {
      setApplyingUpdates(false)
    }
  }

  const [items, setItems] = useState<readonly MarketplaceCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<MarketplaceItemKind | ''>('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<MarketplaceItemDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [installOutcome, setInstallOutcome] = useState<{
    readonly tone: 'success' | 'danger'
    readonly message: string
  } | null>(null)

  /** Set only when the server answered `MARKETPLACE_UPDATE_REQUIRES_APPROVAL`. */
  const [pendingUpdate, setPendingUpdate] = useState<{
    readonly itemId: string
    readonly displayName: string
    readonly pending: readonly MarketplaceCapabilityItem[]
  } | null>(null)
  const [updateOutcome, setUpdateOutcome] = useState<{
    readonly tone: 'success' | 'danger'
    readonly message: string
  } | null>(null)
  const [working, setWorking] = useState(false)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setLoadError(null)
    try {
      setItems(
        await listMarketplaceItems(token, {
          ...(kindFilter === '' ? {} : { kind: kindFilter }),
          ...(query.trim() === '' ? {} : { q: query }),
        }),
      )
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : t('marketplace.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, kindFilter, query, t])

  useEffect(() => {
    if (activeTab === 'discover') void load()
  }, [activeTab, load])

  const openDetail = useCallback(
    async (id: string): Promise<void> => {
      if (token === null) return
      setSelectedId(id)
      setDetail(null)
      setDetailError(null)
      setInstallOutcome(null)
      setPendingUpdate(null)
      setUpdateOutcome(null)
      setDetailLoading(true)
      try {
        setDetail(await getMarketplaceItem(token, id))
      } catch (caught) {
        setDetailError(caught instanceof ApiError ? caught.message : t('marketplace.detailError'))
      } finally {
        setDetailLoading(false)
      }
    },
    [token, t],
  )

  function closeDetail(): void {
    setSelectedId(null)
    setDetail(null)
    setDetailError(null)
    setInstallOutcome(null)
    setPendingUpdate(null)
    setUpdateOutcome(null)
  }

  /**
   * The install button's target: `PluginPermissionReview`'s `onApprove`
   * fires with whatever the admin checked, but installing here is one
   * indivisible server call (there is no partial-capability install), so
   * every approved list — reviewed or "approve all" — leads to the same
   * real request. Reading the capability list at all is what the review
   * step is for; approving fewer of them does not make the plugin do less.
   */
  async function confirmInstall(): Promise<void> {
    if (token === null || detail === null) return
    setWorking(true)
    setInstallOutcome(null)
    try {
      const record = await installMarketplaceItem(token, detail.id)
      setInstallOutcome({
        tone: 'success',
        message: record.signatureVerified
          ? t('marketplace.installedVerified', { name: detail.displayName })
          : t('marketplace.installedUnverified', { name: detail.displayName }),
      })
      await load()
      setDetail(await getMarketplaceItem(token, detail.id))
    } catch (caught) {
      // The failure that matters most: never let a rejected signature read
      // as anything but a rejection.
      setInstallOutcome({
        tone: 'danger',
        message:
          caught instanceof ApiError
            ? t('marketplace.installFailed', { message: caught.message })
            : t('marketplace.installError'),
      })
    } finally {
      setWorking(false)
    }
  }

  async function startUpdate(): Promise<void> {
    if (token === null || detail === null) return
    setWorking(true)
    setUpdateOutcome(null)
    setPendingUpdate(null)
    try {
      await updateMarketplaceItem(token, detail.id)
      setUpdateOutcome({
        tone: 'success',
        message: t('marketplace.updated', { name: detail.displayName }),
      })
      await load()
      setDetail(await getMarketplaceItem(token, detail.id))
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'MARKETPLACE_UPDATE_REQUIRES_APPROVAL') {
        // `CogentaError.details` (which is where the server computes the
        // exact newly-requested capabilities) is deliberately never
        // serialised to a client (`errorResponse` in `@cogenta/api`'s
        // `rest/http.ts`) — that stripping is a real security rule, not an
        // oversight, so this never reaches into the error body for it.
        // What is safe to show, and what this reuses, is the capability
        // list already fetched for the "fiche détaillée" (`detail.capabilities`,
        // the new version's full requested set via `preview()`) — real
        // server data, just not narrowed to only the delta.
        setPendingUpdate({
          itemId: detail.id,
          displayName: detail.displayName,
          pending: detail.capabilities,
        })
        return
      }
      setUpdateOutcome({
        tone: 'danger',
        message:
          caught instanceof ApiError
            ? t('marketplace.updateFailed', { message: caught.message })
            : t('marketplace.updateError'),
      })
    } finally {
      setWorking(false)
    }
  }

  async function confirmWidenedUpdate(): Promise<void> {
    if (token === null || pendingUpdate === null) return
    setWorking(true)
    try {
      await updateMarketplaceItem(token, pendingUpdate.itemId, {
        confirmPendingPermissions: true,
      })
      setUpdateOutcome({
        tone: 'success',
        message: t('marketplace.updated', { name: pendingUpdate.displayName }),
      })
      setPendingUpdate(null)
      await load()
      if (detail !== null) setDetail(await getMarketplaceItem(token, detail.id))
    } catch (caught) {
      setUpdateOutcome({
        tone: 'danger',
        message:
          caught instanceof ApiError
            ? t('marketplace.updateFailed', { message: caught.message })
            : t('marketplace.updateError'),
      })
    } finally {
      setWorking(false)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="marketplace-heading">
        <h1 id="marketplace-heading">{t('marketplace.heading')}</h1>
        <p role="alert">{t('marketplace.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="marketplace-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="marketplace-heading" className="m-0 text-xl leading-7 font-semibold">
          {t('marketplace.heading')}
        </h1>
        <p className="mt-1 text-sm">{t('marketplace.intro')}</p>
        <p className="mt-1 text-sm">
          <a
            href="https://github.com/cogenta-cms/cogenta/blob/main/docs/guide-plugin.md"
            target="_blank"
            rel="noreferrer"
          >
            {t('marketplace.guideLink')}
          </a>
          {' · '}
          <a
            href="https://github.com/cogenta-cms/cogenta/tree/main/examples/plugin-starter"
            target="_blank"
            rel="noreferrer"
          >
            {t('marketplace.starterLink')}
          </a>
        </p>
      </div>

      <div role="tablist" aria-label={t('marketplace.tabsLabel')} className="flex flex-wrap gap-2">
        <Button
          variant={activeTab === 'installed' ? 'primary' : 'secondary'}
          size="sm"
          aria-pressed={activeTab === 'installed'}
          onClick={() => setActiveTab('installed')}
        >
          {t('marketplace.installedTab')}
          {updatesSummary !== null && updatesSummary.count > 0
            ? ` (${t('marketplace.installed.updatesBadge', { count: updatesSummary.count })})`
            : ''}
        </Button>
        <Button
          variant={activeTab === 'discover' ? 'primary' : 'secondary'}
          size="sm"
          aria-pressed={activeTab === 'discover'}
          onClick={() => setActiveTab('discover')}
        >
          {t('marketplace.discoverTab')}
        </Button>
      </div>

      {activeTab === 'installed' && (
        <div className="flex flex-col gap-4">
          {installedError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{installedError}</p>
            </Notice>
          )}
          {installedLoading && <p>{t('common.loading')}</p>}

          {!installedLoading && installedError === null && (
            <>
              {updatesSummary !== null && updatesSummary.count > 0 && (
                <Notice tone="info" live="off">
                  <p>
                    {t('marketplace.installed.updatesAvailable', { count: updatesSummary.count })}
                  </p>
                  <div className="mt-2">
                    <Button
                      size="sm"
                      disabled={applyingUpdates}
                      onClick={() => void applyAllUpdates()}
                    >
                      {t('marketplace.installed.updateAll')}
                    </Button>
                  </div>
                </Notice>
              )}

              {applyResult !== null && (
                <Notice tone="success" live="polite">
                  <p>
                    {t('marketplace.installed.applyResult', {
                      applied: applyResult.applied.length,
                      skipped: applyResult.skipped.length,
                      failed: applyResult.failed.length,
                    })}
                  </p>
                  {applyResult.skipped.length > 0 && (
                    <p>{t('marketplace.installed.applySkippedHint')}</p>
                  )}
                </Notice>
              )}

              <TableRoot label={t('marketplace.installed.tableLabel')}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>{t('marketplace.nameColumn')}</TableHeader>
                      <TableHeader>{t('marketplace.installed.versionColumn')}</TableHeader>
                      <TableHeader>{t('marketplace.statusColumn')}</TableHeader>
                      <TableHeader>{t('marketplace.installed.permissionsColumn')}</TableHeader>
                      <TableHeader>{t('marketplace.installed.usageColumn')}</TableHeader>
                      <TableHeader>{t('marketplace.installed.actionsColumn')}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {installedItems.map((item) => {
                      const status = statusLabel(item, t)
                      const outcome = rowOutcome?.itemId === item.itemId ? rowOutcome : null
                      return (
                        <TableRow key={item.itemId}>
                          <TableCell>
                            <button
                              type="button"
                              className="cursor-pointer bg-transparent p-0 text-left font-medium text-primary underline-offset-2 hover:underline"
                              onClick={() => void openDetail(item.itemId)}
                            >
                              {item.displayName}
                            </button>
                            {outcome !== null && (
                              <p role="alert" className="mt-1 text-sm text-danger">
                                {outcome.message}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.pluginVersion ?? '—'}
                            {item.updateAvailable && (
                              <span className="ml-1 text-xs">
                                {t('marketplace.installed.updateAvailable', {
                                  version: item.latestVersion ?? '',
                                })}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span data-tone={status.tone}>{status.label}</span>
                          </TableCell>
                          <TableCell>
                            {item.grantedCapabilities.length === 0
                              ? t('marketplace.installed.noPermissions')
                              : t('marketplace.installed.permissionsCount', {
                                  count: item.grantedCapabilities.length,
                                })}
                          </TableCell>
                          <TableCell>
                            {item.usage === null
                              ? t('marketplace.installed.noUsage')
                              : t('marketplace.installed.usageSummary', {
                                  count: item.usage.callCount,
                                  when: relativeTime(
                                    item.usage.lastRunAt,
                                    new Date(),
                                    i18n.language,
                                  ),
                                })}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void toggleEnabled(item)}
                              >
                                {item.enabled
                                  ? t('marketplace.installed.deactivate')
                                  : t('marketplace.installed.activate')}
                              </Button>
                              {item.updateAvailable && !item.updateRequiresApproval && (
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    if (token === null) return
                                    try {
                                      await updateMarketplaceItem(token, item.itemId)
                                      await loadInstalled()
                                    } catch (caught) {
                                      setRowOutcome({
                                        itemId: item.itemId,
                                        tone: 'danger',
                                        message:
                                          caught instanceof ApiError
                                            ? caught.message
                                            : t('marketplace.installed.updateError'),
                                      })
                                    }
                                  }}
                                >
                                  {t('marketplace.installed.updateNow')}
                                </Button>
                              )}
                              {item.updateAvailable && item.updateRequiresApproval && (
                                <Button size="sm" onClick={() => void openDetail(item.itemId)}>
                                  {t('marketplace.installed.reviewUpdate')}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  setConfirmUninstall({
                                    itemId: item.itemId,
                                    displayName: item.displayName,
                                    removeData: false,
                                  })
                                }
                              >
                                {t('marketplace.installed.uninstall')}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {installedItems.length === 0 && (
                      <TableEmpty colSpan={6}>{t('marketplace.installed.empty')}</TableEmpty>
                    )}
                  </TableBody>
                </Table>
              </TableRoot>
            </>
          )}
        </div>
      )}

      {activeTab === 'discover' && (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <div className="max-w-xs grow">
              <Field label={t('marketplace.searchLabel')}>
                {(control) => (
                  <Input
                    {...control}
                    value={query}
                    placeholder={t('marketplace.searchPlaceholder')}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                )}
              </Field>
            </div>
            <div className="max-w-xs">
              <Field label={t('marketplace.kindLabel')}>
                {(control) => (
                  <Select
                    {...control}
                    value={kindFilter}
                    onChange={(event) =>
                      setKindFilter(event.target.value as MarketplaceItemKind | '')
                    }
                  >
                    <option value="">{t('marketplace.kindAll')}</option>
                    <option value="plugin">{t('marketplace.kindPlugin')}</option>
                    <option value="theme">{t('marketplace.kindTheme')}</option>
                    <option value="skin">{t('marketplace.kindSkin')}</option>
                    <option value="skill">{t('marketplace.kindSkill')}</option>
                  </Select>
                )}
              </Field>
            </div>
          </div>

          {loadError !== null && (
            <Notice tone="danger" live="assertive">
              <p>{loadError}</p>
            </Notice>
          )}
          {loading && <p>{t('common.loading')}</p>}

          {!loading && loadError === null && (
            <TableRoot label={t('marketplace.tableLabel')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('marketplace.nameColumn')}</TableHeader>
                    <TableHeader>{t('marketplace.kindColumn')}</TableHeader>
                    <TableHeader>{t('marketplace.categoryColumn')}</TableHeader>
                    <TableHeader>{t('marketplace.descriptionColumn')}</TableHeader>
                    <TableHeader>{t('marketplace.statusColumn')}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <button
                          type="button"
                          className="cursor-pointer bg-transparent p-0 text-left font-medium text-primary underline-offset-2 hover:underline"
                          onClick={() => void openDetail(item.id)}
                        >
                          {item.displayName}
                        </button>
                      </TableCell>
                      <TableCell>{kindLabel(item.kind, t)}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>
                        {item.installed
                          ? t('marketplace.installedBadge', {
                              version: item.installedVersion ?? '',
                            })
                          : t('marketplace.notInstalledBadge')}
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 && (
                    <TableEmpty colSpan={5}>{t('marketplace.empty')}</TableEmpty>
                  )}
                </TableBody>
              </Table>
            </TableRoot>
          )}
        </>
      )}

      <Modal
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail()
        }}
        title={detail?.displayName ?? t('marketplace.detailHeading')}
        closeLabel={t('marketplace.close')}
      >
        {detailLoading && <p>{t('common.loading')}</p>}
        {detailError !== null && (
          <Notice tone="danger" live="assertive">
            <p>{detailError}</p>
          </Notice>
        )}

        {detail !== null && (
          <div className="flex flex-col gap-4">
            <p>{detail.description}</p>

            <dl className="m-0 grid grid-cols-2 gap-1 text-sm">
              <dt className="font-medium">{t('marketplace.authorLabel')}</dt>
              <dd className="m-0">{detail.author ?? t('marketplace.unknownValue')}</dd>
              <dt className="font-medium">{t('marketplace.sourceLabel')}</dt>
              <dd className="m-0">
                {detail.source === 'registry'
                  ? t('marketplace.sourceRegistry')
                  : t('marketplace.unknownValue')}
              </dd>
              <dt className="font-medium">{t('marketplace.compatibilityLabel')}</dt>
              <dd className="m-0">
                {detail.engineCompatible === null
                  ? t('marketplace.compatibilityUnknown')
                  : detail.engineCompatible
                    ? t('marketplace.compatibilityOk')
                    : t('marketplace.compatibilityRefused')}
              </dd>
            </dl>

            {detail.engineCompatible === false && (
              <Notice tone="danger" live="assertive">
                <p>{t('marketplace.compatibilityRefusedBody')}</p>
              </Notice>
            )}

            {detail.screenshots.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {detail.screenshots.map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt={t('marketplace.screenshotAlt', { name: detail.displayName })}
                    className="h-24 w-auto rounded border border-border object-cover"
                  />
                ))}
              </div>
            )}

            {detail.changelog.length > 0 && (
              <section aria-labelledby="marketplace-changelog-heading">
                <h3 id="marketplace-changelog-heading" className="m-0 text-sm font-semibold">
                  {t('marketplace.changelogHeading')}
                </h3>
                <ul className="m-0 list-none p-0 text-sm">
                  {detail.changelog.map((entry) => (
                    <li key={entry.version}>
                      <strong>{entry.version}</strong> — {entry.notes}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!detail.supported && (
              <Notice tone="warning">
                <p>{t('marketplace.kindUnsupported', { kind: kindLabel(detail.kind, t) })}</p>
              </Notice>
            )}

            {detail.supported && detail.error !== null && (
              <Notice tone="danger" live="assertive" title={t('marketplace.signatureRefusedTitle')}>
                <p>{t('marketplace.signatureRefusedBody', { message: detail.error.message })}</p>
              </Notice>
            )}

            {detail.supported && detail.error === null && (
              <Notice
                tone={detail.signatureVerified ? 'success' : 'warning'}
                title={
                  detail.signatureVerified
                    ? t('marketplace.signatureVerifiedTitle')
                    : t('marketplace.signatureUnverifiedTitle')
                }
              >
                <p>
                  {detail.signatureVerified
                    ? t('marketplace.signatureVerifiedBody')
                    : t('marketplace.signatureUnverifiedBody')}
                </p>
              </Notice>
            )}

            {installOutcome !== null && (
              <Notice tone={installOutcome.tone} live="assertive">
                <p>{installOutcome.message}</p>
              </Notice>
            )}
            {updateOutcome !== null && (
              <Notice tone={updateOutcome.tone} live="assertive">
                <p>{updateOutcome.message}</p>
              </Notice>
            )}

            {detail.supported && detail.error === null && !detail.installed && (
              <PluginPermissionReview
                pluginName={detail.displayName}
                items={detail.capabilities}
                onApprove={() => void confirmInstall()}
              />
            )}

            {detail.supported && detail.error === null && detail.installed && (
              <div className="flex flex-col gap-3">
                <p>
                  {t('marketplace.alreadyInstalled', { version: detail.installedVersion ?? '' })}
                </p>
                {pendingUpdate === null ? (
                  <div>
                    <Button disabled={working} onClick={() => void startUpdate()}>
                      {t('marketplace.checkForUpdate')}
                    </Button>
                  </div>
                ) : (
                  <section
                    aria-labelledby="marketplace-widened-permissions-heading"
                    className="flex flex-col gap-3 rounded border border-border p-3"
                  >
                    <h3
                      id="marketplace-widened-permissions-heading"
                      className="m-0 text-sm font-semibold"
                    >
                      {t('marketplace.widenedPermissionsHeading')}
                    </h3>
                    <Notice tone="warning">
                      <p>{t('marketplace.widenedPermissionsIntro')}</p>
                    </Notice>
                    {/* Same review component the install flow uses (L7 task 7) —
                        this update is refused by the server until it is explicitly
                        confirmed here, never applied on the first click. */}
                    <PluginPermissionReview
                      pluginName={pendingUpdate.displayName}
                      items={pendingUpdate.pending}
                      onApprove={() => void confirmWidenedUpdate()}
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        disabled={working}
                        onClick={() => setPendingUpdate(null)}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={confirmUninstall !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmUninstall(null)
        }}
        title={t('marketplace.installed.uninstallHeading', {
          name: confirmUninstall?.displayName ?? '',
        })}
        closeLabel={t('marketplace.close')}
      >
        {confirmUninstall !== null && (
          <div className="flex flex-col gap-4">
            <p>{t('marketplace.installed.uninstallIntro')}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmUninstall.removeData}
                onChange={(event) =>
                  setConfirmUninstall({ ...confirmUninstall, removeData: event.target.checked })
                }
              />
              {t('marketplace.installed.removeDataLabel')}
            </label>
            {confirmUninstall.removeData && (
              <Notice tone="warning">
                <p>{t('marketplace.installed.removeDataWarning')}</p>
              </Notice>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmUninstall(null)}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={() => void confirmUninstallAction()}>
                {t('marketplace.installed.uninstall')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}

function kindLabel(kind: MarketplaceItemKind, t: (key: string) => string): string {
  switch (kind) {
    case 'plugin':
      return t('marketplace.kindPlugin')
    case 'theme':
      return t('marketplace.kindTheme')
    case 'skin':
      return t('marketplace.kindSkin')
    case 'skill':
      return t('marketplace.kindSkill')
    default:
      return kind
  }
}
