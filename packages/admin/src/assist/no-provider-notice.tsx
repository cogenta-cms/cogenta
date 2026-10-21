import type { JSX, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { buttonVariants, Notice } from '../ui/index.js'

/**
 * What a screen that needs an AI provider says when none is configured —
 * the same sentence shape and the same way out on every one of them
 * (assistant, agents, site generator, theme generator), rather than four
 * notices of which only one had a button to the screen that fixes it.
 */
export function NoProviderNotice({ children }: { readonly children: ReactNode }): JSX.Element {
  const { t } = useTranslation()
  return (
    <Notice
      tone="info"
      actions={
        <Link to="/providers" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
          {t('providers.configureAction')}
        </Link>
      }
    >
      {children}
    </Notice>
  )
}
