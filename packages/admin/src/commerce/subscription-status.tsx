import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { SubscriptionStatus } from '../api/commerce-client.js'
import { Badge, type BadgeProps } from '../ui/index.js'

const TONES: Readonly<Record<SubscriptionStatus, NonNullable<BadgeProps['tone']>>> = {
  active: 'success',
  past_due: 'warning',
  paused: 'neutral',
  cancelled: 'danger',
}

/** A subscription's status as a coloured chip. */
export function SubscriptionStatusBadge({
  status,
}: {
  readonly status: SubscriptionStatus
}): JSX.Element {
  const { t } = useTranslation()
  return <Badge tone={TONES[status]}>{t(`commerceSubscriptions.status.${status}`)}</Badge>
}
