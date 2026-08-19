import { createEmailAdapter, createFileEmailTransport } from '@cogenta/channels'

/**
 * The one place an account invitation (fiche 17 task 1) becomes an email —
 * `commands/serve.ts`'s `createUsersRouter` wiring, on both the initial
 * `POST /api/users` (`invite: true`) and the resend route.
 *
 * Sibling of `reset-mail.ts`, deliberately not merged into it: the wording is
 * different enough (a role, not a security warning; a "set your password"
 * link, not a "reset it" one) that folding both into one function would need
 * a branch parameter standing in for what is really two different mails
 * sharing one transport.
 */

export interface InviteMailSite {
  readonly name: string
  readonly url: string
}

export interface SendInviteMailOptions {
  /** Where the outgoing mail is written. Defaults to `.cogenta/mail` under the project. */
  readonly mailDir: string
  /**
   * The admin screen the invitee's link opens, with the token appended as
   * `?token=` — the same screen `/forgot-password`'s link opens, since
   * redeeming a token is redeeming a token regardless of which reason issued
   * it (`POST /api/auth/reset-password` does not know or care).
   */
  readonly acceptUrl: string
}

/**
 * Sends the invitation through `@cogenta/channels`, not through a second
 * mailer of this command's own — same reasoning as `sendResetMail`.
 *
 * The transport is the file one, because it is the only one that exists: a
 * real SMTP transport is a documented, deliberate gap in that package. This
 * writes a real message to a real file and says exactly where, rather than
 * pretending mail left the machine — and it is only ever called at all when
 * `onInvite` was wired, which `createUsersRouter`'s R1 fallback treats as
 * "email is available" (see that file's header).
 */
export async function sendInviteMail(
  options: SendInviteMailOptions,
  site: InviteMailSite,
  address: string,
  roles: readonly string[],
  token: string,
  expiresAt: string,
): Promise<string> {
  const { mailDir: directory, acceptUrl } = options

  const adapter = createEmailAdapter({
    transport: createFileEmailTransport({ directory }),
  })

  const link = `${acceptUrl}${acceptUrl.includes('?') ? '&' : '?'}token=${token}`

  await adapter.send(
    { id: address },
    {
      level: 'report',
      title: `${site.name} — you have been invited`,
      keyFigures: [
        { label: 'Role(s)', value: roles.join(', ') },
        { label: 'Valid until', value: expiresAt },
      ],
      sections: [
        {
          heading: 'Join the team',
          body: `You have been invited to ${site.name} with the role(s): ${roles.join(', ')}.`,
        },
        {
          heading: 'How to accept',
          body: `Open this link and choose your own password: ${link}\n\nThe link works once and expires at ${expiresAt}. If you were not expecting this, ignore this message — the invitation is useless without it.`,
        },
      ],
    },
  )

  return directory
}
