import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  generateChannelLinkCode,
  type LinkedChannel,
  listLinkedChannels,
  revokeChannelLink,
} from '../api/notices-client.js'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Modal, Notice } from '../ui/index.js'

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
  const { t } = useTranslation()
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

  const load = useCallback(async () => {
    if (token === null) return
    setLoading(true)
    setError(null)
    try {
      setLinked(await listLinkedChannels(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('channels.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  const loadSettings = useCallback(async () => {
    try {
      setSettings(await listSettings())
    } catch {
      // Non-fatal: the bot-name field and the guide both degrade to their
      // generic wording (no name) rather than blocking the rest of the
      // screen over a settings read that failed.
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  async function generate(channelName: SupportedChannel): Promise<void> {
    if (token === null) return
    setActionError(null)
    setBusy(channelName)
    try {
      const result = await generateChannelLinkCode(token, channelName)
      setGenerated({ channelName, ...result })
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('channels.generateError'))
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
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('channels.unlinkError'))
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

  return (
    <section aria-labelledby="channels-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="channels-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('channels.heading')}
        </h1>
        <p className="mt-1 text-sm">{t('channels.intro')}</p>
        {isAdmin && <p className="mt-1 text-sm">{t('channels.chatHint')}</p>}
        {!isAdmin && <p className="mt-1 text-sm">{t('channels.notAdminHint')}</p>}
      </div>

      {generated !== null && (
        <Notice
          tone="success"
          live="assertive"
          title={t('channels.codeTitle', { channel: t(`channels.name.${generated.channelName}`) })}
          onDismiss={() => setGenerated(null)}
          dismissLabel={t('channels.codeDismiss')}
        >
          <p className="font-mono text-lg tracking-widest">{generated.code}</p>
          <p>{t('channels.codeBody', { channel: t(`channels.name.${generated.channelName}`) })}</p>
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
                    <h2>{t(`channels.name.${channelName}`)}</h2>
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
                            time: new Date(link.linkedAt).toLocaleString(),
                          })}
                        </p>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => void unlink(channelName)}
                        >
                          {t('channels.unlink')}
                        </Button>
                      </>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
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
