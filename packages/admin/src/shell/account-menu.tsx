import { type JSX, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAuth } from '../auth/auth-context.js'
import { roleLabels } from '../lib/role-label.js'
import { ChevronDownIcon, LogoutIcon, ProfileIcon } from '../ui/icons.js'

/** Read once by the sign-in screen, which then says the sign-out went through. */
export const SIGNED_OUT_FLAG_KEY = 'cogenta.admin.signedOut'

interface AccountMenuProps {
  readonly email: string
  readonly roles: readonly string[]
}

/**
 * The account menu of the top bar — WordPress's "Howdy, name" corner: who is
 * signed in and with which roles, a way to the profile, and the sign-out. It
 * replaces a pill that looked clickable and was not, and on a phone it is the
 * only place that says who is signed in.
 */
export function AccountMenu({ email, roles }: AccountMenuProps): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function signOut(): void {
    try {
      sessionStorage.setItem(SIGNED_OUT_FLAG_KEY, '1')
    } catch {
      // Private mode: the sign-in screen just will not mention it.
    }
    void auth.logout()
  }

  return (
    <div ref={rootRef} className="app-shell__account-menu">
      <button
        ref={triggerRef}
        type="button"
        className="app-shell__account-chip"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t('shell.accountMenu', { email })}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true" className="app-shell__account-avatar">
          {email.charAt(0).toUpperCase()}
        </span>
        <span className="app-shell__account-email">{email}</span>
        <ChevronDownIcon className="app-shell__account-caret size-3" />
      </button>
      {open && (
        <div id={panelId} className="app-shell__account-panel">
          <div className="app-shell__account-identity">
            <span className="app-shell__account-identity-label">{t('shell.signedInAs')}</span>
            <strong className="app-shell__account-identity-email">{email}</strong>
            {roles.length > 0 && (
              <span className="app-shell__account-identity-roles">{roleLabels(t, roles)}</span>
            )}
          </div>
          <Link to="/profile" className="app-shell__account-item" onClick={() => setOpen(false)}>
            <ProfileIcon className="size-4" />
            {t('shell.myProfile')}
          </Link>
          <button type="button" className="app-shell__account-item" onClick={signOut}>
            <LogoutIcon className="size-4" />
            {t('shell.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
