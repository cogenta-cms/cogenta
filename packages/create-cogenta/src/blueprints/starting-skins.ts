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
   * A creative/freelance portfolio: brutalist-editorial, an electric violet
   * accent, hard zero-blur offset shadows. L25 pro pass: this entry used to
   * be a terracotta, soft-shadow palette from before `@cogenta/theme-
   * portfolio` existed (L22 task 10 predates the L23 theme it now names) —
   * a scaffolded `portfolio` site rendered the theme's own brutalist CSS
   * against a palette the theme was never designed around. Brought into
   * exact alignment with `packages/theme-portfolio/tokens.json` (colour,
   * font stack — Bricolage Grotesque/Fraunces/JetBrains Mono — scale, radii,
   * motion and the theme's own hard offset shadow), so day one matches the
   * theme's real identity rather than fighting it.
   */
  portfolio: {
    color: {
      bg: '#fafaf7',
      fg: '#0a0a0b',
      accent: '#6d28d9',
      accentFg: '#ffffff',
      muted: '#efede7',
      mutedFg: '#4a4640',
      border: '#dad7ce',
    },
    font: {
      sans: "'Bricolage Grotesque', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
      serif: "'Fraunces', ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.333,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.125rem', md: '0.25rem', lg: '0.5rem' },
    motion: { duration: '180ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', reduced: true },
    shadow: {
      sm: '0.125rem 0.125rem 0 rgba(10, 10, 11, 0.9)',
      md: '0.4rem 0.4rem 0 rgba(10, 10, 11, 0.9)',
    },
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
   * An online store (L25 "templates pro" — a passe pro on
   * `@cogenta/theme-ecommerce`): a bold magenta accent against a warm
   * off-white ground — the "shoppable card" language the theme's own
   * `blocks.css` is built around — matching `@cogenta/theme-ecommerce`'s
   * own default skin (`tokens.json`) exactly, the same way `blog` above
   * matches `theme-blog`'s. The earlier placeholder here (a teal accent,
   * system fonts) never matched what the theme actually ships, which is
   * exactly the divergence this blueprint's own installer must not have:
   * the first render of a scaffolded `store` site now carries the theme's
   * real identity — Archivo for display type, Fraunces for the serif
   * accents `quote`/`prose` reach for — rather than a colour swap away
   * from it.
   */
  store: {
    color: {
      bg: '#fcfaf8',
      fg: '#171414',
      accent: '#d6006d',
      accentFg: '#ffffff',
      muted: '#f3efec',
      mutedFg: '#59524c',
      border: '#e4ddd7',
    },
    font: {
      sans: "'Archivo', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      serif: "'Fraunces', ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.25,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.375rem', md: '0.75rem', lg: '1.25rem' },
    motion: { duration: '160ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', reduced: true },
    shadow: { sm: '0 2px 6px rgba(23, 20, 20, 0.08)', md: '0 12px 32px rgba(23, 20, 20, 0.14)' },
  },

  /**
   * A reading-first personal/professional blog (L25 D4): warm paper-light
   * ground, an ink-blue accent rather than another warm palette's terracotta,
   * matching `@cogenta/theme-blog`'s own default skin (`tokens.json`) so the
   * installer's first render already carries this theme's real identity —
   * Fraunces for headings and Source Serif 4 for the reading column are named
   * here too, not left to a later "Personalise colours" skin swap.
   */
  blog: {
    color: {
      bg: '#fbf6ee',
      fg: '#211c17',
      accent: '#2f4c73',
      accentFg: '#ffffff',
      muted: '#f1e7d6',
      mutedFg: '#4b4238',
      border: '#e3d5be',
    },
    font: {
      sans: "'Inter Tight', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      serif: "'Fraunces', ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.25,
      baseSize: '1.0625rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.1875rem', md: '0.375rem', lg: '0.625rem' },
    motion: { duration: '180ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', reduced: true },
    shadow: { sm: '0 1px 2px rgba(33, 28, 23, 0.07)', md: '0 14px 34px rgba(33, 28, 23, 0.14)' },
  },
  /**
   * A SaaS marketing site (L25): the Linear/Stripe/Vercel register — a
   * confident violet-blue accent on a near-white ground, and a rounder,
   * friendlier button radius (10px) than any of the other presets above,
   * matching `@cogenta/theme-saas`'s own default `tokens.json` exactly (its
   * `defaultTheme`) so a freshly scaffolded site's applied skin and its
   * active theme's own design system agree from the first render.
   */
  saas: {
    color: {
      bg: '#f8f8fc',
      fg: '#15131f',
      accent: '#5a4aeb',
      accentFg: '#ffffff',
      muted: '#eeedf9',
      mutedFg: '#4b4763',
      border: '#e2e0f0',
    },
    font: {
      sans: "'Inter Tight', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.25,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.5rem', md: '0.625rem', lg: '1.25rem' },
    motion: { duration: '150ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', reduced: true },
    shadow: { sm: '0 1px 2px rgba(21, 19, 31, 0.06)', md: '0 16px 40px rgba(21, 19, 31, 0.16)' },
  },
  /**
   * A restaurant (L25 D4): warm cream and charcoal ink, with a deep
   * copper/wine accent — `@cogenta/theme-restaurant`'s own default palette
   * (`packages/theme-restaurant/tokens.json`), copied here rather than
   * referenced, since a blueprint's starting skin and a theme's own default
   * skin are two independent pieces of data the contract keeps separate
   * (a site can change either one without the other, `theme.renderChrome`
   * neither reads nor writes `tokens.json`). Close to square radii and a
   * spacious density match the theme's own "hairlines, not rounded
   * corners" elegance.
   */
  restaurant: {
    color: {
      bg: '#f5ecdc',
      fg: '#231b16',
      accent: '#7a2a2c',
      accentFg: '#ffffff',
      muted: '#ece0cb',
      mutedFg: '#4a3d33',
      border: '#ddccae',
    },
    font: {
      sans: "'Jost', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
      serif: "'Cormorant Garamond', ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.25,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'spacious' },
    radius: { sm: '0.0625rem', md: '0.125rem', lg: '0.25rem' },
    motion: { duration: '220ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', reduced: true },
    shadow: { sm: '0 1px 3px rgba(35, 27, 22, 0.14)', md: '0 16px 40px rgba(35, 27, 22, 0.22)' },
  },
  /**
   * A B2B showcase site (L25, `@cogenta/theme-entreprise`'s pro pass): a
   * confident, premium consultancy register — `packages/theme-entreprise/
   * tokens.json`, copied here rather than referenced (the same independent-
   * copy discipline `restaurant`'s own entry below already follows), so a
   * freshly scaffolded `vitrine` site's applied skin and its active theme's
   * own design system agree from the first render. A deep forest-green
   * accent rather than the more expected "corporate blue", near-square
   * radii and a comfortable density matching the theme's own
   * "structured and edged" elevation language.
   */
  vitrine: {
    color: {
      bg: '#fbfaf7',
      fg: '#14201a',
      accent: '#1f5f45',
      accentFg: '#ffffff',
      muted: '#eef1ec',
      mutedFg: '#42493f',
      border: '#d7ddd2',
    },
    font: {
      sans: "'Archivo', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      serif: "'Source Serif 4', ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.2,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.125rem', md: '0.25rem', lg: '0.5rem' },
    motion: { duration: '160ms', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', reduced: true },
    shadow: { sm: '0 1px 2px rgba(20, 32, 26, 0.06)', md: '0 12px 32px rgba(20, 32, 26, 0.14)' },
  },
  /**
   * A nonprofit/community site (L25, `@cogenta/theme-association`): warm,
   * human, trustworthy — a deep-green accent on a light warm off-white
   * (rather than the canonical blue's corporate read), generously rounded
   * corners for big, friendly buttons and event cards.
   */
  association: {
    color: {
      bg: '#fdfbf6',
      fg: '#1f2a20',
      accent: '#1f6b4a',
      accentFg: '#ffffff',
      muted: '#f3ede0',
      mutedFg: '#4a4137',
      border: '#e6dcc8',
    },
    font: {
      sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.25,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.5rem', md: '1rem', lg: '1.5rem' },
    motion: { duration: '200ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 3px rgba(31, 42, 32, 0.08)', md: '0 10px 28px rgba(31, 42, 32, 0.12)' },
  },
}
