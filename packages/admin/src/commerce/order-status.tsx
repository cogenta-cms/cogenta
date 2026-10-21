import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { OrderStatus } from '../api/commerce-client.js'
import { Badge, type BadgeProps } from '../ui/index.js'

const TONES: Readonly<Record<OrderStatus, NonNullable<BadgeProps['tone']>>> = {
  pending: 'warning',
  paid: 'info',
  shipped: 'primary',
  delivered: 'success',
  cancelled: 'neutral',
  refunded: 'danger',
}

/** An order's status as a coloured chip — the colour carries the state, the word names it. */
export function OrderStatusBadge({ status }: { readonly status: OrderStatus }): JSX.Element {
  const { t } = useTranslation()
  return <Badge tone={TONES[status]}>{t(`commerceOrders.status.${status}`)}</Badge>
}
