import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  type TotpSetup,
} from '../api/client.js'
import { getMedia, listMedia, type MediaAsset } from '../api/media-client.js'
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
import { MediaThumbnail } from '../media/media-thumbnail.js'
import '../styles/media.css'
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
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const [profile, setProfile] = useState<AdminUser | null>(null)
  const [sessions, setSessions] = useState<readonly UserSession[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordChanged, setPasswordChanged] = useState(false)
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

  // Public profile (fiche 17 task 3). Seeded from `profile` only once, keyed
  // on the account id rather than the whole object: `load()` re-runs after
  // every unrelated MFA action on this same page, and re-seeding on each of
  // those would silently discard whatever the person was mid-typing here.
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [locale, setLocale] = useState('')
  const [avatarMediaId, setAvatarMediaId] = useState<string | null>(null)
  const [avatarAsset, setAvatarAsset] = useState<MediaAsset | null>(null)
  const [avatarChoices, setAvatarChoices] = useState<readonly MediaAsset[]>([])
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
    // Public and unchanging for the lifetime of the page: fetched once,
    // never as part of the profile reload above.
    getPasswordPolicy()
      .then(setPasswordPolicy)
      .catch(() => undefined)
  }, [load, loadActivity])

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

  async function openAvatarPicker(): Promise<void> {
    if (token === null) return
    setProfileError(null)
    try {
      const page = await listMedia(token, { kind: 'image' })
      setAvatarChoices(page.items)
      setPickingAvatar(true)
    } catch (caught) {
      setProfileError(caught instanceof ApiError ? caught.message : t('profile.avatarLoadError'))
    }
  }

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
    setPasswordChanged(false)
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

  async function startTotp(): Promise<void> {
    if (token === null) return
    setSecurityError(null)
    setSecurityDone(null)
    try {
      setEnrolment(await beginTotpEnrolment(token))
    } catch (caught) {
      setSecurityError(caught instanceof ApiError ? caught.message : t('profile.totpBeginError'))
    }
  }

  async function confirmTotp(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setSecurityError(null)
    setRecoveryError(null)
    try {
      const issued = await confirmTotpEnrolment(token, totpCode)
      setEnrolment(null)
      setTotpCode('')
      setSecurityDone(t('profile.totpEnabled'))
      // Minted in the same step as confirmation (fiche 18 task 1): shown
      // once, right here, before anything else on the page changes.
      setRecoveryCodes(issued.recoveryCodes)
      await load()
    } catch (caught) {
      setSecurityError(caught instanceof ApiError ? caught.message : t('profile.totpCodeError'))
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
      setSecurityError(caught instanceof ApiError ? caught.message : t('profile.totpDisableError'))
    }
  }

  async function addPasskey(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setSecurityError(null)
    setSecurityDone(null)
    try {
      await registerPasskey(token, passkeyLabel === '' ? undefined : passkeyLabel)
      setPasskeyLabel('')
      setSecurityDone(t('profile.passkeyAdded'))
      await load()
    } catch (caught) {
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
    <section aria-labelledby="profile-heading" className="flex max-w-3xl flex-col gap-6">
      <h1 id="profile-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('profile.heading')}
      </h1>

      {loadError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{loadError}</p>
        </Notice>
      )}

      {profile !== null && (
        <p>{t('profile.signedInAs', { email: profile.email, roles: profile.roles.join(', ') })}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('profile.publicProfileHeading')}</h2>
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
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void openAvatarPicker()}
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

                {pickingAvatar && token !== null && (
                  <ul className="media-field__picker">
                    {avatarChoices.map((choice) => (
                      <li key={choice.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setAvatarMediaId(choice.id)
                            setAvatarAsset(choice)
                            setPickingAvatar(false)
                          }}
                        >
                          <MediaThumbnail
                            token={token}
                            id={choice.id}
                            alt={choice.alt}
                            previewable
                          />
                          <span>{choice.filename}</span>
                        </button>
                      </li>
                    ))}
                    {avatarChoices.length === 0 && <li>{t('fields.mediaNoImages')}</li>}
                    <li>
                      <button type="button" onClick={() => setPickingAvatar(false)}>
                        {t('common.cancel')}
                      </button>
                    </li>
                  </ul>
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
            <h2>{t('profile.passwordHeading')}</h2>
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
            <form onSubmit={submitPassword} className="flex flex-col gap-4">
              <Field label={t('profile.currentPassword')}>
                {(control) => (
                  <Input
                    {...control}
                    type="password"
                    autoComplete="current-password"
                    required
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
                    required
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
                        remaining: passwordPolicy.minLength - newPassword.length,
                      })}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit">{t('profile.confirmChangePassword')}</Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setPasswordFormOpen(false)
                    setCurrentPassword('')
                    setNewPassword('')
                    setPasswordError(null)
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
          {securityError !== null && (
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
            {profile !== null && ` ${t('profile.passkeyCount', { count: profile.mfa.passkeys })}`}
          </p>

          {profile?.mfa.totp === true ? (
            <div>
              <Button variant="destructive" onClick={() => void turnOffTotp()}>
                {t('profile.disableTotp')}
              </Button>
            </div>
          ) : enrolment === null ? (
            <div>
              <Button onClick={() => void startTotp()}>{t('profile.enableTotp')}</Button>
            </div>
          ) : (
            <form onSubmit={confirmTotp} className="flex flex-col gap-4">
              <p>{t('profile.totpScan')}</p>
              <p>
                <strong>{t('profile.totpKeyLabel')}</strong>{' '}
                <code className="font-mono">{enrolment.secret}</code>
              </p>
              <Field label={t('profile.totpCode')}>
                {(control) => (
                  <Input
                    {...control}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={totpCode}
                    onChange={(event) => setTotpCode(event.target.value)}
                  />
                )}
              </Field>
              <div>
                <Button type="submit">{t('profile.totpConfirm')}</Button>
              </div>
            </form>
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
              <Button variant="secondary" onClick={() => void regenerateCodes()}>
                {t('profile.recoveryRegenerate')}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id="sessions">{t('profile.sessionsHeading')}</h2>
          </CardTitle>
          <CardDescription>{t('profile.sessionsIntro')}</CardDescription>
        </CardHeader>
        <CardBody>
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
              disabled={sessions.length <= 1}
              onClick={() => void revokeOthers()}
            >
              {t('profile.revokeOtherSessions')}
            </Button>
          </div>
        </CardBody>
      </Card>

      <SessionList sessions={sessions} onRevoke={(id) => void revoke(id)} />

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
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    {t(`audit.actionLabel.${entry.action}`, { defaultValue: entry.action })}
                  </span>
                  <span className="text-muted-foreground">{entry.at}</span>
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
    </section>
  )
}
