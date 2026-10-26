import { type JSX, type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { listProviders } from '../api/providers-client.js'
import { useAuth } from '../auth/auth-context.js'
import { buttonVariants, Notice } from '../ui/index.js'

/**
 * What a screen that needs an AI provider says when none is usable — the
 * same sentence shape and the same way out on every one of them (assistant,
 * agents, site generator, theme generator), rather than four notices of
 * which only one had a button to the screen that fixes it.
 *
 * "None configured" and "all of them switched off" are two different things
 * to fix, so it asks the Providers list which one this is, and in the second
 * case names the providers that are waiting to be switched on instead of
 * claiming that nothing is configured.
 */
export function NoProviderNotice({ children }: { readonly children: ReactNode }): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const [disabled, setDisabled] = useState<readonly string[]>([])

  useEffect(() => {
    if (token === null) return
    let cancelled = false
    listProviders(token)
      .then((providers) => {
        if (!cancelled) {
          setDisabled(providers.filter((provider) => !provider.enabled).map((p) => p.provider))
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <Notice
      tone="info"
      actions={
        <Link to="/providers" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          {disabled.length > 0 ? t('providers.manageAction') : t('providers.configureAction')}
        </Link>
      }
    >
      {disabled.length > 0 ? (
        <p>
          {t('providers.allDisabledNotice', {
            providers: disabled.join(', '),
            count: disabled.length,
          })}
        </p>
      ) : (
        children
      )}
    </Notice>
  )
}
