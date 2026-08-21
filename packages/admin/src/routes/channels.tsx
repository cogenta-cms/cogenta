import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  generateChannelLinkCode,
  type LinkedChannel,
  listLinkedChannels,
  revokeChannelLink,
} from '../api/notices-client.js'
import { useAuth } from '../auth/auth-context.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'

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
 */

const CHANNEL_NAMES = ['telegram', 'slack', 'discord'] as const
type SupportedChannel = (typeof CHANNEL_NAMES)[number]

interface GeneratedCode {
  readonly channelName: SupportedChannel
  readonly code: string
  readonly expiresAt: string
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

  return (
    <section aria-labelledby="channels-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="channels-heading" className="m-0 text-xl leading-7 font-semibold">
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
            return (
              <Card key={channelName}>
                <CardHeader>
                  <CardTitle>
                    <h2>{t(`channels.name.${channelName}`)}</h2>
                  </CardTitle>
                </CardHeader>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
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
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
