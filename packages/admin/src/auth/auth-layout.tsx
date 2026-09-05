import type { JSX, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listSettings } from '../api/settings-client.js'
import { getShellStatus } from '../api/shell-status-client.js'
import { deriveBrandingSettings, deriveSiteTitle } from '../settings/site-settings-context.js'
import '../styles/auth.css'
import { AgentsIcon, MarketplaceIcon, McpIcon } from '../ui/icons.js'

/**
 * The white-label decision this anonymous screen needs — a subset of
 * `BrandingSettings`/`useSiteTitle` derived the same way `app-shell.tsx`'s
 * `renderBrandMark()` does, but from this screen's own direct
 * `listSettings()` call (`GET /api/settings` answers an anonymous caller —
 * `settings-client.ts`'s own header says so) rather than
 * `SiteSettingsProvider`, which only wraps the authenticated shell routes
 * and never mounts for `/login` (fiche 35 audit T01).
 */
interface LoginBranding {
  readonly showCogentaBranding: boolean
  readonly customLogoMediaId: string | null
  readonly siteTitle: string | null
}

/** Same bare mark `app-shell.tsx`'s `BRAND_MARK_FALLBACK` uses — a named constant, not a raw `//` literal in JSX, which Biome's JSX linter reads as a stray line comment. */
const BRAND_MARK_FALLBACK = '//'

/**
 * The mark and version at the top of the rail — present on every step
 * (password, TOTP, recovery, forgot/reset password), never inside the
 * card: a sign-in screen with no visible "which product is this" is
 * disorienting the first time anyone sees it.
 *
 * Three outcomes, same priority order as `app-shell.tsx`'s
 * `renderBrandMark()` (logo-override case excluded — that one is the
 * *admin theme's* own logo, a signed-in-only concept this anonymous screen
 * has no access to): (1) Cogenta's own credit, the default and the only
 * case that shows the version number — a white-labelled install has no
 * reason to advertise which CMS runs it; (2) a white-label logo, served
 * through the public, unauthenticated `/_image` endpoint (the same one
 * `media-detail.tsx` uses) since this screen has no session token to send
 * `/api/media/{id}/file`'s auth-gated route — `alt` carries the site's own
 * title rather than the literal word "Cogenta" it was just asked not to
 * name; (3) branding off with nothing uploaded yet: an unlabelled mark,
 * never a hole where a logo should be.
 */
/** Same target the public site's own footer credit links to (`theme-render.ts`'s `renderFooterBranding`) — one project, one link, never a second URL invented for this screen. */
const COGENTA_PROJECT_URL = 'https://github.com/cogenta-cms/cogenta'

function LoginBrand({
  version,
  branding,
}: {
  readonly version: string | null
  readonly branding: LoginBranding
}): JSX.Element {
  const { showCogentaBranding, customLogoMediaId, siteTitle } = branding
  const mark = showCogentaBranding ? (
    <img src="/_cogenta/logo-cogenta.png" alt="Cogenta" width={40} height={40} />
  ) : customLogoMediaId !== null ? (
    <img
      src={`/_image?id=${encodeURIComponent(customLogoMediaId)}&w=80`}
      alt={siteTitle ?? ''}
      width={40}
      height={40}
    />
  ) : (
    <span aria-hidden="true" className="text-lg font-semibold text-muted-foreground">
      {BRAND_MARK_FALLBACK}
    </span>
  )
  const versionChip = showCogentaBranding && version !== null && version !== '' && (
    <span className="font-mono text-xs text-muted-foreground">v{version}</span>
  )
  // Cogenta's own credit links back to the project — the same behaviour the
  // public site's footer already has (`renderFooterBranding`), missing here
  // until now: a white-labelled logo links to nothing, since it names a
  // site the visitor already knows, not this project.
  return showCogentaBranding ? (
    <a
      href={COGENTA_PROJECT_URL}
      rel="noopener"
      target="_blank"
      className="flex flex-col items-center gap-2"
    >
      {mark}
      {versionChip}
    </a>
  ) : (
    <div className="flex flex-col items-center gap-2">
      {mark}
      {versionChip}
    </div>
  )
}

/** One feature chip in the rail: a small rounded icon well beside its label. */
function HighlightChip({
  icon: Icon,
  children,
}: {
  readonly icon: typeof AgentsIcon
  readonly children: ReactNode
}): JSX.Element {
  return (
    <li className="auth-layout__chip">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
        <Icon className="size-4" />
      </span>
      <span>{children}</span>
    </li>
  )
}

/**
 * The split layout every anonymous auth screen shares — `login.tsx`,
 * `forgot-password.tsx`, `reset-password.tsx`.
 *
 * A dark "aurora" rail (`>= lg`) carries the brand, the product promise and
 * three feature highlights; `children` — always a `<Card>` — sits centred on
 * the workspace background to its right. This is where the brand/version
 * fetch used to live inside `login.tsx` alone; hoisting it here is what lets
 * the two password-recovery screens, which never had it, show the same
 * white-label-aware brand without a second copy of the fetch.
 */
export function AuthLayout({ children }: { readonly children: ReactNode }): JSX.Element {
  const { t } = useTranslation()
  const [version, setVersion] = useState<string | null>(null)
  // Defaults to showing Cogenta while the request is in flight or fails —
  // the same "never flash unbranded" discipline `useBrandingSettings`
  // documents, so a slow network never briefly shows a bare mark on a
  // white-labelled site (or, worse, "Cogenta" on one that turned it off).
  const [branding, setBranding] = useState<LoginBranding>({
    showCogentaBranding: true,
    customLogoMediaId: null,
    siteTitle: null,
  })

  useEffect(() => {
    let cancelled = false
    getShellStatus()
      .then((status) => {
        if (!cancelled) setVersion(status.cogentaVersion)
      })
      .catch(() => undefined)
    listSettings()
      .then((settings) => {
        if (cancelled) return
        const { showCogentaBranding, customLogoMediaId } = deriveBrandingSettings(settings)
        setBranding({
          showCogentaBranding,
          customLogoMediaId,
          siteTitle: deriveSiteTitle(settings),
        })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="auth-layout">
      <aside className="auth-layout__rail">
        <div className="auth-layout__glow auth-layout__glow--a" aria-hidden="true" />
        <div className="auth-layout__glow auth-layout__glow--b" aria-hidden="true" />
        <div className="auth-layout__glow auth-layout__glow--c" aria-hidden="true" />
        <div className="auth-layout__rail-inner">
          <LoginBrand version={version} branding={branding} />
          <p className="auth-layout__tagline">{t('login.tagline')}</p>
          <ul className="auth-layout__chips">
            <HighlightChip icon={AgentsIcon}>{t('login.highlightAgents')}</HighlightChip>
            <HighlightChip icon={MarketplaceIcon}>{t('login.highlightThemes')}</HighlightChip>
            <HighlightChip icon={McpIcon}>{t('login.highlightHeadless')}</HighlightChip>
          </ul>
        </div>
      </aside>
      <main className="auth-layout__content">{children}</main>
    </div>
  )
}
