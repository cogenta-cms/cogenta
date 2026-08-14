/**
 * R1 — "Aucune dépendance dure à une infrastructure... Tout besoin
 * d'infrastructure passe par une interface avec au moins deux
 * implémentations, dont une sans service externe." Real SMTP (protocol
 * state machine, STARTTLS negotiation, MIME) is a materially larger
 * undertaking than Telegram's plain-HTTP Bot API (L6 task 4) — closer to
 * the WXR-XML-parsing precedent (`@cogenta/import`) than to a REST client.
 * This interface exists so `createEmailAdapter` never depends on how mail
 * actually leaves the process; only the local, degraded `FileEmailTransport`
 * is built in this pass — a real SMTP/HTTP-API transport is a documented,
 * deliberate follow-up (see `email` package doc comment), not built here.
 */
export interface OutgoingEmail {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html: string
}

export interface SentEmail {
  readonly messageId: string
}

export interface EmailTransport {
  send(email: OutgoingEmail): Promise<SentEmail>
}
