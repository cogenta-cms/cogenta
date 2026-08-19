import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ApiError,
  beginTotpEnrolment,
  confirmTotpEnrolment,
  disableTotp,
  registerPasskey,
  type TotpSetup,
} from '../api/client.js'
import { getMedia, listMedia, type MediaAsset } from '../api/media-client.js'
import {
  type AdminUser,
  changeOwnPassword,
  listUserSessions,
  readUser,
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

  const load = useCallback(async () => {
    if (token === null) return
    setLoadError(null)
    try {
      const [me, mine] = await Promise.all([readUser(token, 'me'), listUserSessions(token, 'me')])
      setProfile(me)
      setSessions(mine)
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : t('profile.loadError'))
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

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
    try {
      await confirmTotpEnrolment(token, totpCode)
      setEnrolment(null)
      setTotpCode('')
      setSecurityDone(t('profile.totpEnabled'))
      await load()
    } catch (caught) {
      setSecurityError(caught instanceof ApiError ? caught.message : t('profile.totpCodeError'))
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
        <CardBody>
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
            {passwordChanged && (
              <Notice tone="success" live="assertive">
                <p>{t('profile.passwordChanged')}</p>
              </Notice>
            )}
            <div>
              <Button type="submit">{t('profile.changePassword')}</Button>
            </div>
          </form>
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

      <SessionList sessions={sessions} onRevoke={(id) => void revoke(id)} />
    </section>
  )
}
