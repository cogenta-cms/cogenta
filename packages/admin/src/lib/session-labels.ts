import type { TFunction } from 'i18next'

/**
 * How a session's browser family and device type read to a person: the
 * server reports raw tokens (`chrome`, `desktop`) so the list reads as
 * "Chrome sur ordinateur", not as a leaked identifier.
 */
const BROWSERS: Readonly<Record<string, string>> = {
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  safari: 'Safari',
  opera: 'Opera',
}

export function browserLabel(t: TFunction, browser: string): string {
  return BROWSERS[browser] ?? t(`sessionLabels.browser.${browser}`, { defaultValue: browser })
}

export function deviceLabel(t: TFunction, device: string): string {
  return t(`sessionLabels.device.${device}`, { defaultValue: device })
}

/** "Chrome sur ordinateur" — one phrase for the pair. */
export function sessionDeviceLabel(t: TFunction, browser: string, device: string): string {
  return t('users.sessionDevice', {
    browser: browserLabel(t, browser),
    device: deviceLabel(t, device),
  })
}
