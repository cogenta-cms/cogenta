import type { TFunction } from 'i18next'
import type { OrderEvent } from '../api/commerce-client.js'

/**
 * One line of an order's history, in the admin's own language.
 *
 * The shop writes the history's notes in English (they are also read by API
 * clients and logs). The notes it writes *itself* — "Order X placed.",
 * "Tracking added: …", "Confirmation e-mail sent to …" — follow fixed
 * patterns, so the admin recognises them and says the same thing in its own
 * words. A note typed by a person (a refund reason, a payment remark) is shown
 * as written, and an unrecognised system note is dropped rather than shown in a
 * language the person does not read.
 */
export interface DescribedEvent {
  readonly title: string
  /** A person's own words, or `null`. */
  readonly detail: string | null
}

const METHOD_NOTE = /^Manual payment recorded \((\w+)\)(?::\s*(.*?))?\.?$/su
const TRACKING_NOTE = /^Tracking added:\s*(.+?)\s+(\S+)\.$/su
const EMAIL_SENT = /^(Confirmation|Shipment notification) e-mail sent to (.+)\.$/su
const EMAIL_FAILED =
  /^(Confirmation|Shipment notification) e-mail to (.+?) failed after (\d+) attempts?:/su
const SYSTEM_NOTES: readonly RegExp[] = [
  /^Order .+ placed\.$/u,
  /^Order details corrected before payment\.$/u,
  /^Shipped, tracking attached\.$/u,
  /^Payment (settled via|started via) .+\.$/u,
  /^Refunded \d+ [A-Z]{3}\.$/u,
  /^Fully refunded\.$/u,
  /^Manual payment recorded \(/u,
  /^Refund of the whole order$/u,
  /^Invoice .+ issued\.$/u,
]

export function describeOrderEvent(
  event: OrderEvent,
  t: TFunction,
  paymentMethodLabel: (method: string) => string,
): DescribedEvent {
  const note = event.note?.trim() ?? ''
  const base = t(`commerceOrderDetail.event.${event.kind}`)

  if (event.kind === 'status_changed' && event.toStatus !== null) {
    return {
      title: t('commerceOrderDetail.eventStatus', {
        status: t(`commerceOrders.status.${event.toStatus}`),
      }),
      detail: humanNote(note),
    }
  }

  if (event.kind === 'payment_settled') {
    const match = METHOD_NOTE.exec(note)
    if (match !== null) {
      const method = paymentMethodLabel(match[1] ?? 'other')
      return {
        title: t('commerceOrderDetail.eventPaidBy', { method }),
        detail: match[2] !== undefined && match[2] !== '' ? match[2] : null,
      }
    }
    return { title: base, detail: humanNote(note) }
  }

  if (event.kind === 'tracking_added') {
    const match = TRACKING_NOTE.exec(note)
    return {
      title:
        match === null
          ? base
          : t('commerceOrderDetail.eventTracking', { carrier: match[1], number: match[2] }),
      detail: null,
    }
  }

  if (event.kind === 'note') {
    const sent = EMAIL_SENT.exec(note)
    if (sent !== null) {
      return {
        title: t(
          sent[1] === 'Confirmation'
            ? 'commerceOrderDetail.eventConfirmationSent'
            : 'commerceOrderDetail.eventShipmentSent',
          { email: sent[2] },
        ),
        detail: null,
      }
    }
    const failed = EMAIL_FAILED.exec(note)
    if (failed !== null) {
      return {
        title: t('commerceOrderDetail.eventEmailFailed', {
          email: failed[2],
          count: Number(failed[3]),
        }),
        detail: null,
      }
    }
    if (/^Credit note .+ issued/u.test(note)) {
      return { title: t('commerceOrderDetail.eventCreditNote'), detail: null }
    }
    if (/^Subscription automatically suspended/u.test(note)) {
      return { title: t('commerceOrderDetail.eventDunningSuspended'), detail: null }
    }
    if (/^Prorated charge/u.test(note)) {
      return { title: t('commerceOrderDetail.eventProration'), detail: null }
    }
    return { title: base, detail: humanNote(note) }
  }

  return { title: base, detail: humanNote(note) }
}

/** A note typed by a person, or `null` when it is one of the shop's own English sentences. */
function humanNote(note: string): string | null {
  if (note === '') return null
  return SYSTEM_NOTES.some((pattern) => pattern.test(note)) ? null : note
}
