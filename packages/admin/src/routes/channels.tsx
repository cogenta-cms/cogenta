import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmAction } from '../ai/confirm-action.js'
import { describeAiErrorLine } from '../ai/server-text.js'
import { useFlash } from '../ai/use-flash.js'
import {
  type ChannelsRunnerState,
  generateChannelLinkCode,
  getChannelsRunner,
  type LinkedChannel,
  listLinkedChannels,
  revokeChannelLink,
} from '../api/notices-client.js'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CopyButton,
  Modal,
  Notice,
} from '../ui/index.js'

/**
 * L22 task 2 — "Canaux" : linking a personal Telegram/Slack/Discord account
 * through the one-time-code protocol L6 already built and tested
 * (`@cogenta/channels`' `ChannelLinkStore`). No new linking mechanism here —
 * this screen is a UI on top of the exact same `/api/notices/channels/*`
 * routes fiche 38 already exposed for notice delivery (`notices-client.ts`,
 * unmodified); a link created here is the same row `listLinkedChannels`
 * (fiche 38) reads, so it is immediately usable for both a notice and — for
 * an admin account — chatting with an agent from the channel
 * (`@cogenta/channels`' `createAgentChatBridge`, wired in `cogenta channels`).
 *
 * What this screen deliberately does not add: per-channel notification
 * preferences (`getChannelPreferences`/`setChannelPreferences` already exist
 * in `notices-client.ts` but have never had a screen either — out of this
 * task's scope, not forgotten).
 *
 * Fiche 59 — a real user testing this screen reported it as bare: nothing on
 * it explains that (a) `cogenta channels` has to be running as a separate,
 * standing process before any code typed into a chat can ever be seen, (b)
 * which bot to actually open a conversation with, or (c) that the code is
 * pasted as a plain message, never a slash command. Two additions answer
 * that, without touching the linking mechanism itself (`codes.ts`,
 * `channels.ts` — unchanged): a "How does this work?" guide per card
 * (generic four-step protocol, identical on the three channels, per
 * `codes.ts`'s own doc comment), and an optional, free-text bot name per
 * channel — `channels.<name>BotName` in the site settings registry
 * (`@cogenta/schema`), reusing `SiteSettingsField` exactly the way every
 * other editorial setting screen does rather than inventing a second save
 * path. The bot name is never a secret (R7's boundary is the *token*, which
 * this screen never touches — env-only, `cogenta channels`'s own `USAGE`
 * text) — `GET /api/settings` is public, so the guide can name the bot to a
 * non-admin reading the same card.
 */

const CHANNEL_NAMES = ['telegram', 'slack', 'discord'] as const
type SupportedChannel = (typeof CHANNEL_NAMES)[number]

interface GeneratedCode {
  readonly channelName: SupportedChannel
  readonly code: string
  readonly expiresAt: string
}

/** `channels.<name>BotName` — the one settings key per channel this screen renders and edits. */
function botNameSettingKey(channelName: SupportedChannel): string {
  return `channels.${channelName}BotName`
}

export function ChannelsRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [linked, setLinked] = useState<readonly LinkedChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<SupportedChannel | null>(null)
  const [generated, setGenerated] = useState<GeneratedCode | null>(null)
  const [settings, setSettings] = useState<readonly SiteSetting[]>([])
  const [guideChannel, setGuideChannel] = useState<SupportedChannel | null>(null)
  const [runner, setRunner] = useState<ChannelsRunnerState | null>(null)
  const [pendingUnlink, setPendingUnlink] = useState<string | null>(null)
  const flash = useFlash()

  const load = useCallback(async () => {
    if (token === null) return
    setLoading(true)
    setError(null)
    try {
      setLinked(await listLinkedChannels(token))
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('channels.loadError')))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  const loadSettings = useCallback(async () => {
    try {
      setSettings(await listSettings(undefined, token ?? undefined))
    } catch {
      // Non-fatal: the bot-name field and the guide both degrade to their
      // generic wording (no name) rather than blocking the rest of the
      // screen over a settings read that failed.
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  // Whether the standing `cogenta channels` process is up: asked again every
  // half minute, since it can be started or stopped while this page is open.
  useEffect(() => {
    if (token === null) return
    let active = true
    const check = (): void => {
      getChannelsRunner(token)
        .then((state) => {
          if (active) setRunner(state)
        })
        .catch(() => {
          if (active) setRunner(null)
        })
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [token])

  async function generate(channelName: SupportedChannel): Promise<void> {
    if (token === null) return
    setActionError(null)
    setBusy(channelName)
    try {
      const result = await generateChannelLinkCode(token, channelName)
      setGenerated({ channelName, ...result })
    } catch (caught) {
      setActionError(describeAiErrorLine(caught, t, t('channels.generateError')))
    } finally {
      setBusy(null)
    }
  }

  async function unlink(channelName: string): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await revokeChannelLink(token, channelName)
      if (generated?.channelName === channelName) setGenerated(null)
      flash.show(t('channels.unlinked', { channel: t(`channels.name.${channelName}`) }))
      await load()
    } catch (caught) {
      setActionError(describeAiErrorLine(caught, t, t('channels.unlinkError')))
    } finally {
      setPendingUnlink(null)
    }
  }

  async function saveBotName(channelName: SupportedChannel, value: unknown): Promise<void> {
    if (token === null) return
    await writeSetting(token, botNameSettingKey(channelName), value)
    await loadSettings()
  }

  function botNameFor(channelName: SupportedChannel): string {
    const setting = settings.find((entry) => entry.key === botNameSettingKey(channelName))
    return typeof setting?.value === 'string' ? setting.value : ''
  }

  const botName = generated === null ? '' : botNameFor(generated.channelName)

  return (
    <section aria-labelledby="channels-heading" className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 id="channels-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('channels.heading')}
        </h1>
        <p className="mt-1 text-sm">{t('channels.intro')}</p>
        {isAdmin && <p className="mt-1 text-sm">{t('channels.chatHint')}</p>}
        {!isAdmin && <p className="mt-1 text-sm">{t('channels.notAdminHint')}</p>}
      </div>

      {/* A code is read by `cogenta channels`, a process of its own: say
          whether it is there before anyone waits for a reply that cannot come. */}
      {runner !== null && (
        <Notice
          tone={runner.running ? 'success' : 'warning'}
          live="off"
          title={runner.running ? t('channels.runnerUp') : t('channels.runnerDown')}
        >
          <p>
            {runner.running
              ? runner.channels.length > 0
                ? t('channels.runnerUpDetail', {
                    channels: runner.channels
                      .map((name) => t(`channels.name.${name}`, { defaultValue: name }))
                      .join(', '),
                  })
                : t('channels.runnerUpNone')
              : t('channels.runnerDownDetail')}
          </p>
        </Notice>
      )}

      {flash.message !== null && (
        <Notice tone="success" live="polite" onDismiss={flash.clear} dismissLabel={t('common.close')}>
          <p>{flash.message}</p>
        </Notice>
      )}

      {generated !== null && (
        <Notice
          tone="success"
          live="assertive"
          title={t('channels.codeTitle', { channel: t(`channels.name.${generated.channelName}`) })}
          onDismiss={() => setGenerated(null)}
          dismissLabel={t('channels.codeDismiss')}
        >
          <p className="m-0 flex flex-wrap items-center gap-3">
            <span className="font-mono text-lg tracking-widest">{generated.code}</span>
            <CopyButton
              value={generated.code}
              label={t('channels.copyCode')}
              copiedLabel={t('channels.codeCopied')}
            />
          </p>
          <p>
            {botName === ''
              ? t('channels.codeBody', { channel: t(`channels.name.${generated.channelName}`) })
              : t('channels.codeBodyNamed', {
                  channel: t(`channels.name.${generated.channelName}`),
                  botName,
                })}
          </p>
          <p className="mt-1 text-sm">
            {t('channels.codeExpiry', {
              time: new Date(generated.expiresAt).toLocaleTimeString(),
            })}
          </p>
        </Notice>
      )}

      {actionError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{actionError}</p>
        </Notice>
      )}
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <div className="flex flex-col gap-4">
          {CHANNEL_NAMES.map((channelName) => {
            const link = linked.find((entry) => entry.channelName === channelName)
            const botNameSetting = settings.find(
              (entry) => entry.key === botNameSettingKey(channelName),
            )
            return (
              <Card key={channelName}>
                <CardHeader>
                  <CardTitle>
                    <h2 className="flex flex-wrap items-center gap-2">
                      {t(`channels.name.${channelName}`)}
                      <Badge tone={link === undefined ? 'neutral' : 'success'}>
                        {link === undefined ? t('channels.stateNotLinked') : t('channels.stateLinked')}
                      </Badge>
                    </h2>
                  </CardTitle>
                </CardHeader>
                <CardBody className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {link === undefined ? (
                      <>
                        <p className="m-0 text-sm">{t('channels.notLinked')}</p>
                        <Button
                          type="button"
                          disabled={busy === channelName}
                          onClick={() => void generate(channelName)}
                        >
                          {busy === channelName
                            ? t('channels.generating')
                            : t('channels.generateCode')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="m-0 text-sm">
                          {t('channels.linkedSince', {
                            time: new Date(link.linkedAt).toLocaleString(i18n.language),
                          })}
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setPendingUnlink(channelName)}
                        >
                          {t('channels.unlink')}
                        </Button>
                      </>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="self-start"
                    onClick={() => setGuideChannel(channelName)}
                  >
                    {t('channels.howTo.button')}
                  </Button>

                  {botNameSetting !== undefined && (
                    <div className="max-w-sm">
                      <SiteSettingsField
                        setting={botNameSetting}
                        canEdit={isAdmin}
                        onSave={(value) => saveBotName(channelName, value)}
                      />
                    </div>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmAction
        open={pendingUnlink !== null}
        title={t('channels.unlinkTitle', {
          channel: pendingUnlink === null ? '' : t(`channels.name.${pendingUnlink}`),
        })}
        confirmLabel={t('channels.unlinkConfirm')}
        onCancel={() => setPendingUnlink(null)}
        onConfirm={() => {
          if (pendingUnlink !== null) void unlink(pendingUnlink)
        }}
      >
        <p className="m-0">{t('channels.unlinkBody')}</p>
      </ConfirmAction>

      <Modal
        open={guideChannel !== null}
        onOpenChange={(open) => {
          if (!open) setGuideChannel(null)
        }}
        title={t('channels.howTo.title', {
          channel: guideChannel === null ? '' : t(`channels.name.${guideChannel}`),
        })}
        description={t('channels.howTo.intro')}
        closeLabel={t('channels.howTo.close')}
      >
        {guideChannel !== null && (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="m-0 text-sm font-semibold">{t('channels.howTo.operatorHeading')}</h3>
              <ol className="m-0 mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
                <li>
                  {t('channels.howTo.step0', { channel: t(`channels.name.${guideChannel}`) })}
                </li>
              </ol>
            </div>
            <div>
              <h3 className="m-0 text-sm font-semibold">{t('channels.howTo.userHeading')}</h3>
              <ol className="m-0 mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
                <li>{t('channels.howTo.step1')}</li>
                <li>
                  {botNameFor(guideChannel) !== ''
                    ? t('channels.howTo.step2WithName', {
                        channel: t(`channels.name.${guideChannel}`),
                        botName: botNameFor(guideChannel),
                      })
                    : t('channels.howTo.step2WithoutName', {
                        channel: t(`channels.name.${guideChannel}`),
                      })}
                </li>
                <li>{t('channels.howTo.step3')}</li>
                <li>{t('channels.howTo.step4')}</li>
              </ol>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
