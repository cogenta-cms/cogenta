import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { type AuditEntry, listMyActivity } from '../api/audit-client.js'
import {
  ApiError,
  beginTotpEnrolment,
  confirmTotpEnrolment,
  disableTotp,
  getPasswordPolicy,
  getRecoveryCodesStatus,
  type PasswordPolicy,
  type RecoveryCodesStatus,
  regenerateRecoveryCodes,
  registerPasskey,
  stepUp,
  type TotpSetup,
} from '../api/client.js'
import { getMedia, type MediaAsset } from '../api/media-client.js'
import {
  type ChannelGrouping,
  type ChannelMinSeverity,
  type ChannelPreferences,
  getChannelPreferences,
  type LinkedChannel,
  listLinkedChannels,
  setChannelPreferences,
} from '../api/notices-client.js'
import {
  type AdminUser,
  changeOwnPassword,
  fetchPersonalDataExport,
  listUserSessions,
  readUser,
  revokeOtherSessions,
  revokeUserSession,
  type UserSession,
  updateOwnProfile,
} from '../api/users-client.js'
import { useAuth } from '../auth/auth-context.js'
import { SUPPORTED_LANGUAGES, setLanguage } from '../i18n/index.js'
import { auditActionLabel } from '../lib/audit-actions.js'
import { roleLabels } from '../lib/role-label.js'
import { AvatarPicker } from '../media/avatar-picker.js'
import { MediaThumbnail } from '../media/media-thumbnail.js'
import { QrCode } from '../profile/qr-code.js'
import { StepUpDialog, type StepUpProof } from '../profile/step-up-dialog.js'
import { useDateTimeFormatter } from '../settings/site-settings-context.js'
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Notice,
  Select,
} from '../ui/index.js'
import { SessionList } from './users.js'

/** Minutes since midnight ↔ an `<input type="time">` value — `ChannelPreferences.quietHours` is minutes (channel-format-agnostic, no time zone of its own), `<input type="time">` wants `HH:MM`. */
function minutesToTimeInput(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function timeInputToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (match === null) return null
  const hours = Number(match[1])
  const mins = Number(match[2])
  return hours * 60 + mins
}

const MIN_SEVERITY_OPTIONS: readonly ChannelMinSeverity[] = ['info', 'warning', 'critical']
const GROUPING_OPTIONS: readonly ChannelGrouping[] = ['immediate', 'hourly', 'daily']

/**
 * One linked channel's notification preferences, editable — fiche 38 task 4
 * / fiche 35 audit T04. `minSeverity`/`grouping` are plain selects;
 * "quiet hours" is a checkbox (on/off) plus two time inputs, since the API
 * itself makes that same distinction (`null` disables it entirely, never a
 * zero-length window).
 */
function ChannelPreferencesEditor({
  channel,
  prefs,
  busy,
  saved,
  onSave,
}: {
  readonly channel: LinkedChannel
  readonly prefs: ChannelPreferences
  readonly busy: boolean
  readonly saved: boolean
  onSave(next: ChannelPreferences): void
}): JSX.Element {
  const { t } = useTranslation()
  const [minSeverity, setMinSeverity] = useState<ChannelMinSeverity>(prefs.minSeverity)
  const [grouping, setGrouping] = useState<ChannelGrouping>(prefs.grouping)
  const [quietEnabled, setQuietEnabled] = useState(prefs.quietHours !== null)
  const [quietStart, setQuietStart] = useState(
    minutesToTimeInput(prefs.quietHours?.startMinute ?? 22 * 60),
  )
  const [quietEnd, setQuietEnd] = useState(
    minutesToTimeInput(prefs.quietHours?.endMinute ?? 7 * 60),
  )

  function submit(): void {
    const startMinute = timeInputToMinutes(quietStart)
    const endMinute = timeInputToMinutes(quietEnd)
    onSave({
      eventTypes: prefs.eventTypes,
      minSeverity,
      grouping,
      quietHours:
        quietEnabled && startMinute !== null && endMinute !== null
          ? { startMinute, endMinute }
          : null,
    })
  }

  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="text-sm font-semibold">
        {t(`channels.name.${channel.channelName}`, { defaultValue: channel.channelName })}
      </legend>
      <Field label={t('profile.notificationsMinSeverityLabel')}>
        {(control) => (
          <Select
            {...control}
            value={minSeverity}
            onChange={(event) => setMinSeverity(event.target.value as ChannelMinSeverity)}
          >
            {MIN_SEVERITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(`profile.notificationsSeverity.${option}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t('profile.notificationsGroupingLabel')}>
        {(control) => (
          <Select
            {...control}
            value={grouping}
            onChange={(event) => setGrouping(event.target.value as ChannelGrouping)}
          >
            {GROUPING_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {t(`profile.notificationsGrouping.${option}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex items-center gap-2">
        <input
          id={`notif-quiet-enabled-${channel.channelName}`}
          type="checkbox"
          checked={quietEnabled}
          onChange={(event) => setQuietEnabled(event.target.checked)}
        />
        <label htmlFor={`notif-quiet-enabled-${channel.channelName}`}>
          {t('profile.notificationsQuietHoursEnable')}
        </label>
      </div>
      {quietEnabled && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('profile.notificationsQuietHoursStart')}>
            {(control) => (
              <Input
                {...control}
                type="time"
                value={quietStart}
                onChange={(event) => setQuietStart(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('profile.notificationsQuietHoursEnd')}>
            {(control) => (
              <Input
                {...control}
                type="time"
                value={quietEnd}
                onChange={(event) => setQuietEnd(event.target.value)}
              />
            )}
          </Field>
        </div>
      )}
      {/* A critical notice always reaches every channel regardless of quiet
          hours (`toChannelSeverity` forces `danger` to `critical`) — said
          here rather than left implicit, since this control could otherwise
          read as a blanket do-not-disturb. */}
      <p className="m-0 text-xs text-muted-foreground">
        {t('profile.notificationsQuietHoursCriticalNote')}
      </p>
      <div className="flex items-center gap-3">
        <Button type="button" disabled={busy} onClick={submit}>
          {busy ? t('profile.notificationsSaving') : t('profile.notificationsSave')}
        </Button>
        {saved && !busy && (
          <span role="status" className="text-sm text-success">
            {t('profile.notificationsSaved')}
          </span>
        )}
      </div>
    </fieldset>
  )
}

/** The page's sections, in order — the contents list's entries and the anchors a link can point at. */
const PROFILE_SECTIONS = [
  { id: 'public-profile', labelKey: 'profile.sections.profile' },
  { id: 'password', labelKey: 'profile.sections.password' },
  { id: 'security', labelKey: 'profile.sections.security' },
  { id: 'recovery-codes', labelKey: 'profile.sections.recovery' },
  { id: 'sessions', labelKey: 'profile.sections.sessions' },
  { id: 'notifications', labelKey: 'profile.sections.notifications' },
  { id: 'activity', labelKey: 'profile.sections.activity' },
  { id: 'personal-data', labelKey: 'profile.sections.data' },
] as const

/**
 * "My profile" — L11 task 3.
 *
 * Everything on this page is about the account making the request and nothing
 * else: the routes it calls take `me`, and the server resolves that from the
 * bearer token, so there is no id here that could be pointed at somebody else.
 *
 * It is also where the MFA recommendation (ADR-0021) sends people. Since MFA is
 * no longer a wall at sign-in, this is the only place it can be turned on — so
 * the second-factor section has to be findable, which is why the notice links
 * straight to it and why passkeys moved here from the settings screen rather
 * than leaving "manage my second factor" split across two pages.
 *
 * Resetting a *forgotten* password is not here: this form asks for the current
 * one, which is a change, not a reset. The reset flow is L13.
 */
export function ProfileRoute(): JSX.Element {
  const formatDateTime = useDateTimeFormatter()
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const { hash } = useLocation()

  const [profile, setProfile] = useState<AdminUser | null>(null)
  const [sessions, setSessions] = useState<readonly UserSession[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null)
  // Kept closed by default: the fields were previously always open on the
  // page, which the user flagged directly — a password form left expanded
  // is one more thing visible over someone's shoulder for no reason, when
  // changing a password is a rare action.
  const [passwordFormOpen, setPasswordFormOpen] = useState(false)

  const [enrolment, setEnrolment] = useState<TotpSetup | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [securityError, setSecurityError] = useState<string | null>(null)
  const [securityDone, setSecurityDone] = useState<string | null>(null)

  const [passkeyLabel, setPasskeyLabel] = useState('')

  // Pentest 2026-10-26, F-01. Changing or removing a second factor needs a
  // fresh proof of the current password (or an authenticator code): the server
  // refuses with `AUTH_STEP_UP_REQUIRED`, this holds the refused action, asks,
  // and replays it once the server has accepted the proof.
  const [stepUpRetry, setStepUpRetry] = useState<(() => Promise<void>) | null>(null)
  const [stepUpBusy, setStepUpBusy] = useState(false)
  const [stepUpError, setStepUpError] = useState<string | null>(null)

  // Public profile (fiche 17 task 3). Seeded from `profile` only once, keyed
  // on the account id rather than the whole object: `load()` re-runs after
  // every unrelated MFA action on this same page, and re-seeding on each of
  // those would silently discard whatever the person was mid-typing here.
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [locale, setLocale] = useState('')
  const [avatarMediaId, setAvatarMediaId] = useState<string | null>(null)
  const [avatarAsset, setAvatarAsset] = useState<MediaAsset | null>(null)
  const [pickingAvatar, setPickingAvatar] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaved, setProfileSaved] = useState(false)

  // Fiche 18 task 1 — recovery codes. `recoveryCodes` holds a freshly issued
  // batch, shown exactly once (right after confirming enrolment or
  // regenerating), never re-fetched: the server does not hand out an
  // existing batch's plaintext again.
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryCodesStatus | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<readonly string[] | null>(null)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)

  // Fiche 18 task 2 — "sign out everywhere else".
  const [sessionsActionError, setSessionsActionError] = useState<string | null>(null)
  const [sessionsActionDone, setSessionsActionDone] = useState<string | null>(null)

  // Fiche 18 task 3 — the password policy, fetched rather than recopied, so
  // it can be announced before the form refuses anything.
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy | null>(null)

  // Fiche 18 task 4 — "my activity", read-only, never anything more than the
  // caller's own twenty most recent actions.
  const [activity, setActivity] = useState<readonly AuditEntry[]>([])
  const [activityError, setActivityError] = useState<string | null>(null)

  // T09-04 (RGPD) — "export my data". Every role, always the caller's own
  // account: the server enforces self-or-admin, this screen only ever asks
  // for `me`.
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  // Fiche 38 task 4 / fiche 35 audit T04 — per-channel notification
  // preferences. `getChannelPreferences`/`setChannelPreferences`
  // (`notices-client.ts`) existed since fiche 38 with no screen ever
  // calling them; `channels.tsx` (the linking screen) deliberately left
  // this out of its own scope. One entry per channel this account already
  // linked — a channel with no link has nothing to set preferences on.
  const [linkedChannels, setLinkedChannels] = useState<readonly LinkedChannel[]>([])
  const [channelPrefs, setChannelPrefsState] = useState<
    Readonly<Record<string, ChannelPreferences>>
  >({})
  const [notificationsError, setNotificationsError] = useState<string | null>(null)
  const [notificationsSaveError, setNotificationsSaveError] = useState<string | null>(null)
  const [notificationsSavedChannel, setNotificationsSavedChannel] = useState<string | null>(null)
  const [notificationsBusyChannel, setNotificationsBusyChannel] = useState<string | null>(null)

  const loadNotificationPreferences = useCallback(async () => {
    if (token === null) return
    setNotificationsError(null)
    try {
      const channels = await listLinkedChannels(token)
      setLinkedChannels(channels)
      const entries = await Promise.all(
        channels.map(
          async (channel) =>
            [channel.channelName, await getChannelPreferences(token, channel.channelName)] as const,
        ),
      )
      setChannelPrefsState(Object.fromEntries(entries))
    } catch (caught) {
      setNotificationsError(
        caught instanceof ApiError ? caught.message : t('profile.notificationsLoadError'),
      )
    }
  }, [token, t])

  const load = useCallback(async () => {
    if (token === null) return
    setLoadError(null)
    try {
      const [me, mine, recovery] = await Promise.all([
        readUser(token, 'me'),
        listUserSessions(token, 'me'),
        getRecoveryCodesStatus(token),
      ])
      setProfile(me)
      setSessions(mine)
      setRecoveryStatus(recovery)
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : t('profile.loadError'))
    }
  }, [token, t])

  const loadActivity = useCallback(async () => {
    if (token === null) return
    setActivityError(null)
    try {
      setActivity(await listMyActivity(token, 20))
    } catch (caught) {
      setActivityError(caught instanceof ApiError ? caught.message : t('profile.activityError'))
    }
  }, [token, t])

  useEffect(() => {
    void load()
    void loadActivity()
    void loadNotificationPreferences()
    // Public and unchanging for the lifetime of the page: fetched once,
    // never as part of the profile reload above.
    getPasswordPolicy()
      .then(setPasswordPolicy)
      .catch(() => undefined)
  }, [load, loadActivity, loadNotificationPreferences])

  // A link such as « Configurer maintenant » points at a section, not at the
  // page: scroll to it once the sections have rendered (the page loads its
  // data first, so the target sits lower than it will once loaded).
  const profileLoaded = profile !== null
  useEffect(() => {
    if (hash === '' || !profileLoaded) return
    const target = document.getElementById(decodeURIComponent(hash.slice(1)))
    target?.scrollIntoView?.({ block: 'start' })
  }, [hash, profileLoaded])

  /** Fiche 38 task 4 — writes one channel's preferences, and only that channel's local state, on success. */
  async function saveChannelPreferences(
    channelName: string,
    next: ChannelPreferences,
  ): Promise<void> {
    if (token === null) return
    setNotificationsBusyChannel(channelName)
    setNotificationsSaveError(null)
    setNotificationsSavedChannel(null)
    try {
      const saved = await setChannelPreferences(token, channelName, next)
      setChannelPrefsState((current) => ({ ...current, [channelName]: saved }))
      setNotificationsSavedChannel(channelName)
    } catch (caught) {
      setNotificationsSaveError(
        caught instanceof ApiError ? caught.message : t('profile.notificationsSaveError'),
      )
    } finally {
      setNotificationsBusyChannel(null)
    }
  }

  useEffect(() => {
    if (profile === null) return
    setDisplayName(profile.displayName ?? '')
    setBio(profile.bio ?? '')
    setLocale(profile.locale ?? '')
    setAvatarMediaId(profile.avatarMediaId)
  }, [profile?.id])

  useEffect(() => {
    if (token === null || avatarMediaId === null) {
      setAvatarAsset(null)
      return
    }
    let cancelled = false
    getMedia(token, avatarMediaId)
      .then((asset) => {
        if (!cancelled) setAvatarAsset(asset)
      })
      .catch(() => {
        if (!cancelled) setAvatarAsset(null)
      })
    return () => {
      cancelled = true
    }
  }, [token, avatarMediaId])

  async function submitProfile(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setProfileError(null)
    setProfileSaved(false)
    try {
      const trimmedLocale = locale.trim()
      const updated = await updateOwnProfile(token, {
        displayName: displayName.trim() === '' ? null : displayName.trim(),
        bio: bio.trim() === '' ? null : bio.trim(),
        avatarMediaId,
        locale: trimmedLocale === '' ? null : trimmedLocale,
      })
      setProfile(updated)
      setProfileSaved(true)
      // The account-level preference takes effect in this session too, not
      // only "next time the server tells us" — same storage key ADR-0019
      // already uses, so a later sign-in from this browser keeps agreeing
      // with what was just chosen here.
      if ((SUPPORTED_LANGUAGES as readonly string[]).includes(trimmedLocale)) {
        setLanguage(trimmedLocale as (typeof SUPPORTED_LANGUAGES)[number])
      }
    } catch (caught) {
      setProfileError(caught instanceof ApiError ? caught.message : t('profile.profileError'))
    }
  }

  async function submitPassword(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setPasswordError(null)
    setCurrentPasswordError(null)
    setPasswordChanged(false)
    // Checked here rather than left to the browser's own bubbles, which speak
    // the browser's language and not the admin's.
    if (currentPassword === '' || newPassword === '') {
      if (currentPassword === '') setCurrentPasswordError(t('common.fieldRequired'))
      if (newPassword === '') setPasswordError(t('common.fieldRequired'))
      return
    }
    try {
      await changeOwnPassword(token, currentPassword, newPassword)
      setPasswordChanged(true)
      setCurrentPassword('')
      setNewPassword('')
      setPasswordFormOpen(false)
    } catch (caught) {
      setPasswordError(caught instanceof ApiError ? caught.message : t('profile.passwordError'))
    }
  }

  /** True when the server refused an action only because it wants a fresh proof. */
  function needsStepUp(caught: unknown): boolean {
    return caught instanceof ApiError && caught.code === 'AUTH_STEP_UP_REQUIRED'
  }

  function askForStepUp(retry: () => Promise<void>): void {
    setStepUpError(null)
    setStepUpRetry(() => retry)
  }

  async function submitStepUp(proof: StepUpProof): Promise<void> {
    if (token === null || stepUpRetry === null) return
    setStepUpBusy(true)
    setStepUpError(null)
    try {
      await stepUp(token, proof)
    } catch (caught) {
      setStepUpBusy(false)
      setStepUpError(
        caught instanceof ApiError && caught.code === 'RATE_LIMITED'
          ? caught.message
          : caught instanceof ApiError && caught.code === 'AUTH_RATE_LIMITED'
            ? caught.message
            : 'password' in proof
              ? t('profile.stepUpWrongPassword')
              : t('profile.stepUpWrongCode'),
      )
      return
    }
    const retry = stepUpRetry
    setStepUpRetry(null)
    setStepUpBusy(false)
    await retry()
  }

  async function startTotp(): Promise<void> {
    if (token === null) return
    setSecurityError(null)
    setSecurityDone(null)
    try {
      setEnrolment(await beginTotpEnrolment(token))
    } catch (caught) {
      if (needsStepUp(caught)) {
        askForStepUp(startTotp)
        return
      }
      setSecurityError(caught instanceof ApiError ? caught.message : t('profile.totpBeginError'))
    }
  }

  async function confirmTotp(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setSecurityError(null)
    setRecoveryError(null)
    if (!/^[0-9]{6}$/u.test(totpCode.trim())) {
      setSecurityError(t('profile.totpCodeFormat'))
      return
    }
    try {
      const issued = await confirmTotpEnrolment(token, totpCode.trim())
      setEnrolment(null)
      setTotpCode('')
      setSecurityDone(t('profile.totpEnabled'))
      // Minted in the same step as confirmation (fiche 18 task 1): shown
      // once, right here, before anything else on the page changes.
      setRecoveryCodes(issued.recoveryCodes)
      await load()
    } catch (caught) {
      // The server's own wording is English and generic ("invalid
      // credentials"); what the person needs to know is that this code did
      // not match, next to the field they typed it in.
      setSecurityError(
        caught instanceof ApiError && caught.code === 'RATE_LIMITED'
          ? caught.message
          : t('profile.totpCodeError'),
      )
    }
  }

  async function regenerateCodes(): Promise<void> {
    if (token === null) return
    setRecoveryError(null)
    try {
      const issued = await regenerateRecoveryCodes(token)
      setRecoveryCodes(issued.recoveryCodes)
      setRecoveryStatus(await getRecoveryCodesStatus(token))
    } catch (caught) {
      if (needsStepUp(caught)) {
        askForStepUp(regenerateCodes)
        return
      }
      setRecoveryError(
        caught instanceof ApiError ? caught.message : t('profile.recoveryRegenerateError'),
      )
    }
  }

  /**
   * A plain text download of the just-issued batch — the same "download"
   * button the fiche asks for. Built with a `Blob` and an object URL, no new
   * dependency: this is a real browser tab, not a sandboxed preview, so a
   * script-driven `<a download>` click works exactly as it would on any
   * other site.
   */
  function downloadRecoveryCodes(codes: readonly string[]): void {
    const blob = new Blob([`${codes.join('\n')}\n`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cogenta-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  /**
   * T09-04 (RGPD) — the same `Blob`+`<a download>` pattern as
   * `downloadRecoveryCodes` just above, for a JSON file instead of plain
   * text. The export itself is journalled server-side (`user.personal_data_export`);
   * this only has to fetch it and hand it to the browser.
   */
  async function exportOwnData(): Promise<void> {
    if (token === null || profile === null) return
    setExportError(null)
    setExporting(true)
    try {
      const report = await fetchPersonalDataExport(token, profile.id)
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'cogenta-personal-data.json'
      link.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setExportError(caught instanceof ApiError ? caught.message : t('profile.exportDataError'))
    } finally {
      setExporting(false)
    }
  }

  async function revokeOthers(): Promise<void> {
    if (token === null) return
    setSessionsActionError(null)
    setSessionsActionDone(null)
    try {
      const result = await revokeOtherSessions(token)
      setSessionsActionDone(t('profile.sessionsRevokedOthers', { count: result.revoked }))
      setSessions(await listUserSessions(token, 'me'))
    } catch (caught) {
      setSessionsActionError(
        caught instanceof ApiError ? caught.message : t('profile.sessionsRevokeOthersError'),
      )
    }
  }

  async function turnOffTotp(): Promise<void> {
    if (token === null) return
    setSecurityError(null)
    try {
      await disableTotp(token)
      setSecurityDone(t('profile.totpDisabled'))
      await load()
    } catch (caught) {
      if (needsStepUp(caught)) {
        askForStepUp(turnOffTotp)
        return
      }
      setSecurityError(caught instanceof ApiError ? caught.message : t('profile.totpDisableError'))
    }
  }

  async function addPasskey(event: FormEvent): Promise<void> {
    event.preventDefault()
    await registerNewPasskey()
  }

  async function registerNewPasskey(): Promise<void> {
    if (token === null) return
    setSecurityError(null)
    setSecurityDone(null)
    try {
      await registerPasskey(token, passkeyLabel === '' ? undefined : passkeyLabel)
      setPasskeyLabel('')
      setSecurityDone(t('profile.passkeyAdded'))
      await load()
    } catch (caught) {
      if (needsStepUp(caught)) {
        askForStepUp(registerNewPasskey)
        return
      }
      // A cancelled browser prompt throws too, and "try again" covers both that
      // and a genuine failure.
      setSecurityError(caught instanceof ApiError ? caught.message : t('profile.passkeyRefused'))
    }
  }

  async function revoke(sessionId: string): Promise<void> {
    if (token === null) return
    try {
      await revokeUserSession(token, 'me', sessionId)
      setSessions(await listUserSessions(token, 'me'))
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : t('profile.revokeError'))
    }
  }

  return (
    <section aria-labelledby="profile-heading" className="flex flex-col gap-6">
      <h1 id="profile-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
        {t('profile.heading')}
      </h1>

      {loadError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{loadError}</p>
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,48rem)] lg:items-start lg:gap-10">
        {/* A contents list: this page is long, and a section such as the
            two-step verification should be one click away, not 1 000 px down. */}
        <nav
          aria-label={t('profile.sectionsLabel')}
          className="max-lg:-mx-1 max-lg:overflow-x-auto lg:sticky lg:top-[calc(var(--app-shell-topbar-h,72px)+1.5rem)]"
        >
          <ul className="m-0 flex list-none gap-1 p-1 lg:flex-col lg:p-0">
            {PROFILE_SECTIONS.map((section) => (
              <li key={section.id} className="shrink-0">
                <Link
                  to={{ hash: `#${section.id}` }}
                  replace
                  className={`block rounded-md px-3 py-1.5 text-sm whitespace-nowrap no-underline hover:bg-muted hover:text-foreground ${
                    hash === `#${section.id}`
                      ? 'bg-accent font-medium text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {t(section.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-6 [&_h2]:scroll-mt-28 [&>div]:scroll-mt-28">
          {profile !== null && (
            <p className="m-0">
              {t('profile.signedInAs', {
                email: profile.email,
                roles: roleLabels(t, profile.roles),
              })}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 id="public-profile">{t('profile.publicProfileHeading')}</h2>
              </CardTitle>
              <CardDescription>{t('profile.publicProfileIntro')}</CardDescription>
            </CardHeader>
            <CardBody>
              <Notice tone="info">
                <p>{t('profile.publicProfileVisibility')}</p>
              </Notice>

              {profileError !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{profileError}</p>
                </Notice>
              )}
              {profileSaved && (
                <Notice tone="success" live="assertive">
                  <p>{t('profile.profileSaved')}</p>
                </Notice>
              )}

              {profile === null ? (
                <p>{t('common.loading')}</p>
              ) : (
                <form onSubmit={submitProfile} className="flex flex-col gap-4">
                  <Field
                    label={t('profile.displayNameLabel')}
                    description={t('profile.displayNameHint')}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        maxLength={120}
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                      />
                    )}
                  </Field>

                  <Field label={t('profile.bioLabel')} description={t('profile.bioHint')}>
                    {(control) => (
                      <Input
                        {...control}
                        maxLength={500}
                        value={bio}
                        onChange={(event) => setBio(event.target.value)}
                      />
                    )}
                  </Field>

                  <Field label={t('profile.localeLabel')} description={t('profile.localeHint')}>
                    {(control) => (
                      <Select
                        {...control}
                        value={locale}
                        onChange={(event) => setLocale(event.target.value)}
                      >
                        <option value="">{t('profile.localeUnset')}</option>
                        {SUPPORTED_LANGUAGES.map((language) => (
                          <option key={language} value={language}>
                            {t(`profile.localeOption.${language}`)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>

                  <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
                    <legend className="font-sans text-sm leading-5 font-medium text-foreground p-0">
                      {t('profile.avatarLabel')}
                    </legend>
                    <div className="flex items-center gap-3">
                      {avatarMediaId !== null && avatarAsset !== null && token !== null && (
                        <MediaThumbnail
                          token={token}
                          id={avatarAsset.id}
                          alt={avatarAsset.alt}
                          previewable
                        />
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setPickingAvatar(true)}
                        >
                          {avatarMediaId === null
                            ? t('profile.avatarChoose')
                            : t('profile.avatarChange')}
                        </Button>
                        {avatarMediaId !== null && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setAvatarMediaId(null)}
                          >
                            {t('profile.avatarRemove')}
                          </Button>
                        )}
                      </div>
                    </div>

                    {token !== null && (
                      <AvatarPicker
                        open={pickingAvatar}
                        token={token}
                        selectedId={avatarMediaId}
                        onOpenChange={setPickingAvatar}
                        onPick={(choice) => {
                          setAvatarMediaId(choice.id)
                          setAvatarAsset(choice)
                          setPickingAvatar(false)
                        }}
                      />
                    )}
                  </fieldset>

                  <div>
                    <Button type="submit">{t('profile.saveProfile')}</Button>
                  </div>
                </form>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 id="password">{t('profile.passwordHeading')}</h2>
              </CardTitle>
              <CardDescription>{t('profile.passwordIntro')}</CardDescription>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              {/* Fiche 18 task 3: the policy announced before the form can
              refuse anything — fetched from the same route the server
              enforces, never a second, hand-copied number. Kept visible
              regardless of whether the form itself is open, so it is the
              first thing read even before "Changer le mot de passe" is
              clicked. */}
              {passwordPolicy !== null && (
                <p className="m-0 text-sm text-muted-foreground">
                  {t('profile.passwordPolicyAnnounce', { minLength: passwordPolicy.minLength })}
                </p>
              )}
              {passwordChanged && (
                <Notice tone="success" live="assertive">
                  <p>{t('profile.passwordChanged')}</p>
                </Notice>
              )}
              {!passwordFormOpen ? (
                <div>
                  <Button type="button" onClick={() => setPasswordFormOpen(true)}>
                    {t('profile.changePassword')}
                  </Button>
                </div>
              ) : (
                <form onSubmit={submitPassword} noValidate className="flex flex-col gap-4">
                  <Field label={t('profile.currentPassword')} error={currentPasswordError}>
                    {(control) => (
                      <Input
                        {...control}
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                      />
                    )}
                  </Field>
                  <Field
                    label={t('profile.newPassword')}
                    description={t('profile.newPasswordHint')}
                    error={passwordError}
                  >
                    {(control) => (
                      <Input
                        {...control}
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                      />
                    )}
                  </Field>
                  {passwordPolicy !== null && newPassword.length > 0 && (
                    <p
                      className={
                        newPassword.length >= passwordPolicy.minLength
                          ? 'm-0 text-sm text-success'
                          : 'm-0 text-sm text-destructive'
                      }
                      role="status"
                    >
                      {newPassword.length >= passwordPolicy.minLength
                        ? t('profile.passwordStrengthOk')
                        : t('profile.passwordStrengthShort', {
                            count: passwordPolicy.minLength - newPassword.length,
                          })}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      className="h-auto min-h-9 max-w-full whitespace-normal py-2 text-left"
                    >
                      {t('profile.confirmChangePassword')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setPasswordFormOpen(false)
                        setCurrentPassword('')
                        setNewPassword('')
                        setPasswordError(null)
                        setCurrentPasswordError(null)
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </form>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 id="security">{t('profile.securityHeading')}</h2>
              </CardTitle>
              <CardDescription>{t('profile.securityIntro')}</CardDescription>
            </CardHeader>
            <CardBody>
              {securityError !== null && enrolment === null && (
                <Notice tone="danger" live="assertive">
                  <p>{securityError}</p>
                </Notice>
              )}
              {securityDone !== null && (
                <Notice tone="success" live="assertive">
                  <p>{securityDone}</p>
                </Notice>
              )}

              <p>
                {profile?.mfa.totp === true ? t('profile.totpOn') : t('profile.totpOff')}
                {profile !== null &&
                  ` ${t('profile.passkeyCount', { count: profile.mfa.passkeys })}`}
              </p>

              {enrolment !== null ? (
                <form onSubmit={confirmTotp} noValidate className="flex flex-col gap-4">
                  <p>{t('profile.totpScan')}</p>
                  <QrCode value={enrolment.uri} label={t('profile.totpQrLabel')} />
                  <p>
                    <strong>{t('profile.totpKeyLabel')}</strong>{' '}
                    <code className="font-mono break-all">{enrolment.secret}</code>
                  </p>
                  <Field label={t('profile.totpCode')} error={securityError}>
                    {(control) => (
                      <Input
                        {...control}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={totpCode}
                        onChange={(event) => setTotpCode(event.target.value)}
                      />
                    )}
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit">{t('profile.totpConfirm')}</Button>
                    {/* The pending secret is only ever a candidate: leaving it
                        changes nothing about the factor already protecting the account. */}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setEnrolment(null)
                        setTotpCode('')
                        setSecurityError(null)
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </form>
              ) : profile?.mfa.totp === true ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void startTotp()}>
                    {t('profile.reconfigureTotp')}
                  </Button>
                  <Button variant="destructive" onClick={() => void turnOffTotp()}>
                    {t('profile.disableTotp')}
                  </Button>
                </div>
              ) : (
                <div>
                  <Button
                    className="h-auto min-h-9 max-w-full whitespace-normal py-2 text-left"
                    onClick={() => void startTotp()}
                  >
                    {t('profile.enableTotp')}
                  </Button>
                </div>
              )}

              <form onSubmit={addPasskey} className="flex flex-col gap-4">
                <Field label={t('profile.passkeyLabelField')}>
                  {(control) => (
                    <Input
                      {...control}
                      placeholder={t('profile.passkeyLabelPlaceholder')}
                      value={passkeyLabel}
                      onChange={(event) => setPasskeyLabel(event.target.value)}
                    />
                  )}
                </Field>
                <div>
                  <Button type="submit" variant="secondary">
                    {t('profile.addPasskey')}
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          {/*
           * Fiche 18 task 1 — recovery codes. A section of its own rather than
           * folded into "Two-step verification" above: it has its own state
           * (a freshly issued batch, shown once) and its own action
           * (regenerate), and it needs to stay legible whether or not TOTP is
           * currently on.
           */}
          <Card>
            <CardHeader>
              <CardTitle>
                <h2 id="recovery-codes">{t('profile.recoveryHeading')}</h2>
              </CardTitle>
              <CardDescription>{t('profile.recoveryIntro')}</CardDescription>
            </CardHeader>
            <CardBody>
              {recoveryError !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{recoveryError}</p>
                </Notice>
              )}

              {recoveryCodes !== null ? (
                <Notice
                  tone="warning"
                  live="assertive"
                  title={t('profile.recoveryCodesIssuedTitle')}
                  actions={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => downloadRecoveryCodes(recoveryCodes)}
                    >
                      {t('profile.recoveryCodesDownload')}
                    </Button>
                  }
                  onDismiss={() => setRecoveryCodes(null)}
                  dismissLabel={t('profile.recoveryCodesDismiss')}
                >
                  <p>{t('profile.recoveryCodesIssuedBody')}</p>
                  <ul className="m-0 grid grid-cols-2 gap-1 font-mono text-sm">
                    {recoveryCodes.map((code) => (
                      <li key={code}>{code}</li>
                    ))}
                  </ul>
                </Notice>
              ) : profile?.mfa.totp === true ? (
                <p>
                  {recoveryStatus !== null
                    ? t('profile.recoveryRemaining', {
                        remaining: recoveryStatus.remaining,
                        total: recoveryStatus.total,
                      })
                    : t('profile.loadError')}
                </p>
              ) : (
                <p>{t('profile.recoveryNeedsTotp')}</p>
              )}

              {profile?.mfa.totp === true && recoveryCodes === null && (
                <div>
                  <Button
                    variant="secondary"
                    className="h-auto min-h-9 max-w-full whitespace-normal py-2 text-left"
                    onClick={() => void regenerateCodes()}
                  >
                    {t('profile.recoveryRegenerate')}
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>

          <div id="sessions">
            <SessionList sessions={sessions} onRevoke={(id) => void revoke(id)}>
              <p className="m-0 text-sm text-muted-foreground">{t('profile.sessionsIntro')}</p>
              {sessionsActionError !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{sessionsActionError}</p>
                </Notice>
              )}
              {sessionsActionDone !== null && (
                <Notice tone="success" live="assertive">
                  <p>{sessionsActionDone}</p>
                </Notice>
              )}
              {/* Explicitly spares the session making this very request — the
              server enforces that, this button just names it (fiche 18
              task 2). */}
              <div>
                <Button
                  variant="destructive"
                  className="h-auto min-h-9 max-w-full whitespace-normal py-2 text-left"
                  disabled={sessions.length <= 1}
                  onClick={() => void revokeOthers()}
                >
                  {t('profile.revokeOtherSessions')}
                </Button>
              </div>
            </SessionList>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 id="notifications">{t('profile.notificationsHeading')}</h2>
              </CardTitle>
              <CardDescription>{t('profile.notificationsIntro')}</CardDescription>
            </CardHeader>
            <CardBody className="flex flex-col gap-6">
              {notificationsError !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{notificationsError}</p>
                </Notice>
              )}
              {notificationsSaveError !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{notificationsSaveError}</p>
                </Notice>
              )}
              {linkedChannels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('profile.notificationsNoChannels')}
                </p>
              ) : (
                linkedChannels.map((channel) => {
                  const prefs = channelPrefs[channel.channelName]
                  if (prefs === undefined) return null
                  return (
                    <ChannelPreferencesEditor
                      key={channel.channelName}
                      channel={channel}
                      prefs={prefs}
                      busy={notificationsBusyChannel === channel.channelName}
                      saved={notificationsSavedChannel === channel.channelName}
                      onSave={(next) => void saveChannelPreferences(channel.channelName, next)}
                    />
                  )
                })
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 id="activity">{t('profile.activityHeading')}</h2>
              </CardTitle>
              <CardDescription>{t('profile.activityIntro')}</CardDescription>
            </CardHeader>
            <CardBody>
              {activityError !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{activityError}</p>
                </Notice>
              )}
              {activity.length === 0 ? (
                <p>{t('profile.activityEmpty')}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                  {activity.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-3"
                    >
                      <span>{auditActionLabel(t, entry.action)}</span>
                      <span className="text-muted-foreground">{formatDateTime(entry.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2 id="personal-data">{t('profile.personalDataHeading')}</h2>
              </CardTitle>
              <CardDescription>{t('profile.personalDataIntro')}</CardDescription>
            </CardHeader>
            <CardBody>
              {exportError !== null && (
                <Notice tone="danger" live="assertive">
                  <p>{exportError}</p>
                </Notice>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={exporting || profile === null}
                onClick={() => void exportOwnData()}
              >
                {exporting ? t('profile.exportDataPending') : t('profile.exportData')}
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>

      <StepUpDialog
        open={stepUpRetry !== null}
        canUseCode={profile?.mfa.totp === true}
        canUsePassword={profile?.hasPassword !== false}
        onSignInAgain={() => {
          setStepUpRetry(null)
          setStepUpError(null)
          void auth.logout()
        }}
        busy={stepUpBusy}
        error={stepUpError}
        onSubmit={(proof) => void submitStepUp(proof)}
        onCancel={() => {
          setStepUpRetry(null)
          setStepUpError(null)
        }}
      />
    </section>
  )
}
