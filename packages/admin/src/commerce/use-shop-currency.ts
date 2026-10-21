import { useEffect, useState } from 'react'
import { listSettings } from '../api/settings-client.js'

/**
 * The shop's default currency (`commerce.currency`, a public setting), for the
 * screens that show an amount with no order behind it — the tax simulator, a
 * shipping rate. Falls back to euros until it has loaded or if it cannot.
 */
export function useShopCurrency(token: string | null): string {
  const [currency, setCurrency] = useState('EUR')
  useEffect(() => {
    if (token === null) return
    let cancelled = false
    listSettings(undefined, token)
      .then((settings) => {
        const found = settings.find((setting) => setting.key === 'commerce.currency')
        if (!cancelled && typeof found?.value === 'string' && /^[A-Z]{3}$/u.test(found.value)) {
          setCurrency(found.value)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [token])
  return currency
}
