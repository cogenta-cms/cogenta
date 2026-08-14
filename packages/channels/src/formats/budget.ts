/**
 * "Un message qui ne rentre pas dans un écran de téléphone est un message
 * qui ne sera pas lu." An abstract, channel-agnostic screen budget — not
 * Telegram's real 4096-character API limit (that's a *harder*, later,
 * channel-specific ceiling enforced in `providers/telegram/render.ts`; this
 * one is the point past which `## Formats de message`'s own rule says the
 * detail belongs in the admin, not in the message).
 */
export const REPORT_SCREEN_BUDGET_CHARS = 480

export function reportBodyLength(
  sections: readonly { readonly heading?: string; readonly body: string }[],
): number {
  return sections.reduce(
    (total, section) => total + (section.heading?.length ?? 0) + section.body.length,
    0,
  )
}
