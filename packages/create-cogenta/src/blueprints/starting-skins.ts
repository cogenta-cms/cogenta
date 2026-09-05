import type { SkinTokens } from '@cogenta/render'

/**
 * A starting skin per site type (L22 task 10), used when no AI-generated
 * design was chosen — including when no LLM provider is configured at all
 * (R2). Deliberately not AI: these are fixed, hand-picked token sets, so a
 * `store` site looks like a store and a `magazine` looks like a magazine
 * before a single word is typed into "site description".
 *
 * Every value below is checked against `@cogenta/render`'s own
 * `validateSkin` in `test/starting-skins.test.ts` — the same contrast/
 * structure gate an AI-generated skin has to clear (contract D). Keyed by
 * `Blueprint.id`; a blueprint absent from this map falls back to
 * `@cogenta/theme-canonical`'s own default (`scaffold.ts`'s
 * `canonicalTokensJson`), exactly as every blueprint behaved before this
 * task — this is additive, not a change to the seven blueprints not listed
 * here.
 */
export const STARTING_SKINS: Readonly<Record<string, SkinTokens>> = {
  /**
   * A creative/freelance portfolio: warm, uncluttered, spacious enough that
   * the work (not the chrome) reads first. A terracotta accent instead of
   * the canonical blue, sharper corners than the default's rounded ones.
   */
  portfolio: {
    color: {
      bg: '#ffffff',
      fg: '#1a1a1a',
      accent: '#b8452f',
      accentFg: '#ffffff',
      muted: '#f5f0eb',
      mutedFg: '#55504a',
      border: '#e0d8cf',
    },
    font: {
      sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.2,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'spacious' },
    radius: { sm: '0.125rem', md: '0.25rem', lg: '0.5rem' },
    motion: { duration: '200ms', easing: 'cubic-bezier(0.4, 0, 0.2, 1)', reduced: true },
    shadow: { sm: '0 1px 2px rgba(26, 26, 26, 0.06)', md: '0 8px 30px rgba(26, 26, 26, 0.10)' },
  },

  /**
   * An editorial magazine: denser type, a stronger scale ratio (the classic
   * 1.333 "perfect fourth" editorial ladder), a red accent that reads as
   * masthead rather than as a call-to-action button.
   */
  magazine: {
    color: {
      bg: '#ffffff',
      fg: '#111111',
      accent: '#b91c1c',
      accentFg: '#ffffff',
      muted: '#f4f4f5',
      mutedFg: '#3f3f46',
      border: '#d4d4d8',
    },
    font: {
      sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.333,
      baseSize: '1.0625rem',
    },
    space: { unit: '0.25rem', density: 'compact' },
    radius: { sm: '0.125rem', md: '0.25rem', lg: '0.5rem' },
    motion: { duration: '150ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 2px rgba(17, 17, 17, 0.08)', md: '0 6px 20px rgba(17, 17, 17, 0.12)' },
  },

  /**
   * A documentation site: cool blue-grey neutrals and one confident blue
   * accent — the Docusaurus/GitBook register — with a compact density and
   * restrained radii, since a reference site reads a line at a time rather
   * than as a marketing page.
   */
  documentation: {
    color: {
      bg: '#ffffff',
      fg: '#0f172a',
      accent: '#1d4ed8',
      accentFg: '#ffffff',
      muted: '#f1f5f9',
      mutedFg: '#475569',
      border: '#e2e8f0',
    },
    font: {
      sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.15,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'compact' },
    radius: { sm: '0.25rem', md: '0.375rem', lg: '0.625rem' },
    motion: { duration: '150ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 2px rgba(15, 23, 42, 0.06)', md: '0 10px 28px rgba(15, 23, 42, 0.12)' },
  },

  /**
   * An online store: a teal accent (trust, not urgency — the canonical
   * blue's commerce-adjacent cousin), comfortably rounded corners that read
   * as approachable product cards rather than an admin table.
   */
  store: {
    color: {
      bg: '#ffffff',
      fg: '#14151a',
      accent: '#0f766e',
      accentFg: '#ffffff',
      muted: '#f0fdfa',
      mutedFg: '#134e4a',
      border: '#ccfbf1',
    },
    font: {
      sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.2,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.375rem', md: '0.75rem', lg: '1.25rem' },
    motion: { duration: '180ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 3px rgba(15, 23, 22, 0.08)', md: '0 8px 24px rgba(15, 23, 22, 0.12)' },
  },
}
