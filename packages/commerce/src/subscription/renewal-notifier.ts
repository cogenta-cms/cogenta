import type { EmailTransport } from '@cogenta/channels'
import { buildNotification, renderEmailMessage } from '@cogenta/channels'
import { formatMoney } from '../money.js'
import type { RenewalNoticeInput, RenewalNotifier } from './store.js'

/**
 * A ready-made renewal notifier built on `@cogenta/channels`'s own email
 * primitives (fiche 53 task 5: "réutilise @cogenta/channels") — never a
 * second email renderer inside this package.
 *
 * Deliberately optional and separate from `subscription/store.ts`:
 * `SubscriptionStoreDependencies.notifyRenewal` only ever needs the narrow
 * `RenewalNotifier` function type, so a site that never configures email (or
 * `@cogenta/channels` at all) simply never imports this file, and
 * `sendRenewalNotices` stays a safe no-op (R2). A site that *does* have
 * `@cogenta/channels` wired already owns an `EmailTransport` — the degraded
 * `FileEmailTransport`, or a real one — and passes it here as-is.
 */
export function createEmailRenewalNotifier(transport: EmailTransport): RenewalNotifier {
  return async ({
    subscription,
    customer,
    daysUntilRenewal,
  }: RenewalNoticeInput): Promise<void> => {
    const amount = formatMoney({
      amountMinor: subscription.priceMinor * subscription.quantity,
      currency: subscription.currency,
    })
    const when = daysUntilRenewal <= 0 ? 'today' : `in ${String(daysUntilRenewal)} day(s)`
    const message = buildNotification(`Your subscription renews ${when} for ${amount}.`)
    const rendered = renderEmailMessage(message)

    await transport.send({
      to: customer.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    })
  }
}
