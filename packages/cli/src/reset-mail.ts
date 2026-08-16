import { createEmailAdapter, createFileEmailTransport } from '@cogenta/channels'

/**
 * The one place a password reset token becomes an email — shared between
 * `cogenta users reset-password --email` (a terminal, `commands/users.ts`)
 * and `POST /api/auth/forgot-password` (a browser, `commands/serve.ts`'s
 * `createAuthRouter` wiring).
 *
 * Factored out rather than duplicated: both callers already issue the token
 * through the same `PasswordResetStore`, and a second copy of "how the mail
 * is worded" would drift the moment one of them changed it.
 */

export interface ResetMailSite {
  readonly name: string
  readonly url: string
}

export interface SendResetMailOptions {
  /** Where the outgoing mail is written. Defaults to `.cogenta/mail` under the project. */
  readonly mailDir: string
  /**
   * When set, the mail links to this admin screen (with the token appended as
   * `?token=`) instead of naming the `cogenta users reset-password --token`
   * terminal command. `runServe` passes this so a person who asked from the
   * admin's "forgot password" screen gets something they can click; the CLI
   * command itself never sets it, since whoever ran it is already at a
   * terminal.
   */
  readonly resetUrl?: string
}

/**
 * Sends the reset mail through `@cogenta/channels`, not through a second
 * mailer of this command's own — the email adapter and its transport
 * interface already exist and are the project's one way out.
 *
 * The transport is the file one, because it is the only one that exists: a
 * real SMTP transport is a documented, deliberate gap in that package
 * (`providers/email/transport.ts`). So this writes a real message to a real
 * file and says exactly where, rather than pretending mail left the machine.
 */
export async function sendResetMail(
  options: SendResetMailOptions,
  site: ResetMailSite,
  address: string,
  token: string,
  expiresAt: string,
): Promise<string> {
  const { mailDir: directory, resetUrl } = options

  const adapter = createEmailAdapter({
    transport: createFileEmailTransport({ directory }),
  })

  const howToUseIt =
    resetUrl === undefined
      ? `Run: cogenta users reset-password --token ${token}\n\nThe token works once and expires at ${expiresAt}. If you did not ask for this, ignore this message — the token is useless without it, and asking again replaces it.`
      : `Open this link: ${resetUrl}${resetUrl.includes('?') ? '&' : '?'}token=${token}\n\nThe link works once and expires at ${expiresAt}. If you did not ask for this, ignore this message — the token is useless without it, and asking again replaces it.`

  // `report` of the three fixed message levels: `notification` is one line
  // with nowhere to put a token, and `alert` would stamp "[WARNING]" on the
  // subject and demand an incident's `expectedAction`/`adminUrl`. None of the
  // three was designed for transactional mail; a fourth level would change a
  // closed union every one of the five adapters renders, for one caller.
  await adapter.send(
    { id: address },
    {
      level: 'report',
      title: `${site.name} — password reset`,
      keyFigures: [
        { label: 'Valid until', value: expiresAt },
        { label: 'Uses left', value: '1' },
      ],
      sections: [
        {
          heading: 'Your one-time token',
          body: token,
        },
        {
          heading: 'How to use it',
          body: howToUseIt,
        },
      ],
    },
  )

  return directory
}
