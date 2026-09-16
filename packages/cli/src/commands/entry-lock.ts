import { type HtmlElement, h } from '@cogenta/theme-kit'

/**
 * The lock screen of a password-protected page (`schema@2.2`, ADR-0034).
 *
 * Deliberately the page itself, not a separate one: the theme still draws its
 * header, its footer and the entry's own title, and only the content is
 * replaced by a form. A visitor who follows a link to a protected page should
 * land on that page, not on a login-looking detour.
 *
 * No script: the form posts, the host answers with a cookie and a redirect —
 * the same zero-JS discipline every theme in this repository keeps.
 *
 * `cache-control` needs no special handling here, and that is not an
 * oversight: a request carrying any cookie is already answered
 * `private, no-store` (`http-security.ts`, L10 task 6's security review), so
 * an unlocked page cannot land in a shared cache.
 */

/** Where the form posts. Under the reserved namespace no collection route can claim. */
export const UNLOCK_PATH = '/_cogenta/unlock'

export interface PasswordFormStrings {
  readonly heading: string
  readonly explanation: string
  readonly label: string
  readonly submit: string
  readonly wrong: string
}

const FRENCH: PasswordFormStrings = {
  heading: 'Cette page est protégée',
  explanation: 'Saisissez le mot de passe qui vous a été communiqué pour la lire.',
  label: 'Mot de passe',
  submit: 'Afficher la page',
  wrong: 'Ce mot de passe ne correspond pas. Réessayez.',
}

const ENGLISH: PasswordFormStrings = {
  heading: 'This page is protected',
  explanation: 'Enter the password you were given to read it.',
  label: 'Password',
  submit: 'Show the page',
  wrong: 'That password does not match. Try again.',
}

export function passwordFormStrings(locale: string): PasswordFormStrings {
  return locale.toLowerCase().startsWith('fr') ? FRENCH : ENGLISH
}

export interface PasswordFormOptions {
  readonly entryId: string
  /** Where to send the visitor back to once they are in. Always a path of this site. */
  readonly path: string
  readonly locale: string
  /** True when this render follows a wrong answer, so the form says so. */
  readonly failed: boolean
}

export function renderPasswordForm(options: PasswordFormOptions): HtmlElement {
  const words = passwordFormStrings(options.locale)
  const id = 'cg-unlock-password'

  return h(
    'section',
    { class: 'cg-block cg-unlock' },
    h('h2', { class: 'cg-unlock__title' }, words.heading),
    h('p', { class: 'cg-unlock__explanation' }, words.explanation),
    options.failed ? h('p', { class: 'cg-unlock__error', role: 'alert' }, words.wrong) : null,
    h(
      'form',
      { class: 'cg-unlock__form', method: 'post', action: UNLOCK_PATH },
      // The entry and the return path travel in the form rather than the URL:
      // a password must never end up in a query string, a referrer or a log
      // line, so the whole exchange is a POST body.
      h('input', { type: 'hidden', name: 'entry', value: options.entryId }),
      h('input', { type: 'hidden', name: 'next', value: options.path }),
      h('label', { class: 'cg-unlock__label', for: id }, words.label),
      h('input', {
        class: 'cg-unlock__input',
        id,
        type: 'password',
        name: 'password',
        required: true,
        autocomplete: 'current-password',
      }),
      h('button', { class: 'cg-unlock__submit', type: 'submit' }, words.submit),
    ),
  )
}

/**
 * The minimum a lock screen needs to look deliberate in a theme that has
 * never heard of it — the same `:where()` floor the widget layout uses, so a
 * theme's own rules win without having to fight specificity.
 */
export const UNLOCK_FLOOR_CSS = `
:where(.cg-unlock){max-width:32rem;margin-inline:auto;padding-block:2rem}
:where(.cg-unlock__explanation){margin-block:.5rem 1.25rem}
:where(.cg-unlock__error){color:#b42318;font-weight:600}
:where(.cg-unlock__form){display:flex;flex-direction:column;gap:.5rem}
:where(.cg-unlock__input){padding:.6rem .75rem;border:1px solid currentColor;border-radius:.375rem;font:inherit}
:where(.cg-unlock__submit){align-self:start;padding:.6rem 1.1rem;border:0;border-radius:999px;font:inherit;cursor:pointer}
`.trim()

/** The cookies of one request, by name. An absent or malformed header is simply empty. */
export function parseCookies(header: string | undefined): ReadonlyMap<string, string> {
  const found = new Map<string, string>()
  if (header === undefined) return found
  for (const part of header.split(';')) {
    const at = part.indexOf('=')
    if (at <= 0) continue
    const name = part.slice(0, at).trim()
    if (name === '') continue
    found.set(name, decodeURIComponent(part.slice(at + 1).trim()))
  }
  return found
}
