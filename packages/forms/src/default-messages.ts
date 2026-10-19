/** Site-language defaults; explicitly written author text always takes precedence. */
export function formDefaultMessages(locale = 'en'): {
  readonly confirmation: string
  readonly autoresponder: string
} {
  return locale.toLowerCase().startsWith('fr')
    ? {
        confirmation: 'Merci — votre message a bien été reçu.',
        autoresponder: 'Nous avons bien reçu votre message. Nous vous répondrons dès que possible.',
      }
    : {
        confirmation: 'Thank you — your message has been received.',
        autoresponder:
          'We have received your message. We will get back to you as soon as possible.',
      }
}
