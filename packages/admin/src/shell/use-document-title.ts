import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Names the browser tab "<page> — <brand>". The signed-in shell derives its
 * title from the breadcrumb; the anonymous screens (sign-in, password reset)
 * sit outside the shell, so they set theirs with this.
 */
export function useDocumentTitle(title: string): void {
  const { t } = useTranslation()
  const brand = t('shell.brand')
  useEffect(() => {
    document.title = title === '' ? brand : `${title} — ${brand}`
  }, [title, brand])
}
