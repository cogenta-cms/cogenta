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
   * An independent design studio: black type on white paper, square corners
   * and one signal orange kept for a couple of details (the underline of the
   * contact line, the focus ring). Archivo sets everything, its width axis
   * widening the display sizes. Identical to
   * `packages/theme-portfolio/tokens.json`, so a new studio site starts in
   * the theme's own identity.
   */
  portfolio: {
    color: {
      bg: '#ffffff',
      fg: '#0b0b0b',
      accent: '#ff4f00',
      accentFg: '#000000',
      muted: '#f1f1ef',
      mutedFg: '#5b5b58',
      border: '#dcdcd8',
    },
    font: {
      sans: "'Archivo', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      scale: 1.25,
      baseSize: '1.0625rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0rem', md: '0rem', lg: '0.125rem' },
    motion: { duration: '140ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: {
      sm: '0 1px 0 rgba(11, 11, 11, 0.06)',
      md: '0 8px 24px rgba(11, 11, 11, 0.1)',
    },
  },

  /**
   * An independent news and culture magazine: white newsprint, black ink and
   * one editorial red kept for section kickers and a few rules. Fraunces sets
   * the nameplate and the headlines, Libre Franklin the kickers, bylines and
   * navigation; `@cogenta/theme-magazine` sets the text itself in Source
   * Serif 4. Kept identical to `packages/theme-magazine/tokens.json`, so a
   * scaffolded site renders the theme's own identity from its first page.
   */
  magazine: {
    color: {
      bg: '#ffffff',
      fg: '#151412',
      accent: '#b3121c',
      accentFg: '#ffffff',
      muted: '#f2f0eb',
      mutedFg: '#4a4843',
      border: '#d8d5ce',
    },
    font: {
      sans: "'Libre Franklin', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      serif: "'Fraunces', ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      scale: 1.25,
      baseSize: '1.0625rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0rem', md: '0.125rem', lg: '0.1875rem' },
    motion: { duration: '140ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 0 rgba(21, 20, 18, 0.06)', md: '0 8px 24px rgba(21, 20, 18, 0.1)' },
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
   * A personal publication made for reading (`@cogenta/theme-blog`, L27
   * studio pass): a warm paper, a warm near-black ink and one ink-blue
   * accent kept for links; Literata for everything a reader reads and
   * Figtree for everything a reader uses. Copied from
   * `packages/theme-blog/tokens.json` rather than referenced (the same
   * independent-copy discipline `restaurant` and `vitrine` follow), so a
   * scaffolded `blog` site's skin names the theme's own typefaces and palette
   * from the first render: the theme reads both from the skin, and a skin
   * that named other fonts would silently replace them.
   */
  blog: {
    color: {
      bg: '#f6f2ea',
      fg: '#1e1b17',
      accent: '#26426b',
      accentFg: '#ffffff',
      muted: '#ece5d8',
      mutedFg: '#5a5147',
      border: '#ddd4c5',
    },
    font: {
      sans: "'Figtree', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      serif: "'Literata', ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      scale: 1.25,
      baseSize: '1.0625rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.125rem', md: '0.1875rem', lg: '0.25rem' },
    motion: { duration: '140ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 0 rgba(30, 27, 23, 0.06)', md: '0 8px 24px rgba(30, 27, 23, 0.1)' },
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
   * A management consultancy (`@cogenta/theme-entreprise`, L27 studio pass):
   * a cool ivory paper, a blue-black ink and one deep green accent spent
   * rarely; Newsreader for display and headings, Hanken Grotesk for text.
   * Copied from `packages/theme-entreprise/tokens.json` rather than
   * referenced (the same independent-copy discipline `restaurant` follows),
   * so a scaffolded `vitrine` site's skin names the theme's own typefaces
   * and palette from the first render: the theme reads both from the skin,
   * and a skin that named other fonts would silently replace them.
   */
  vitrine: {
    color: {
      bg: '#f5f5f0',
      fg: '#0f1a24',
      accent: '#174a3a',
      accentFg: '#ffffff',
      muted: '#e9e9e2',
      mutedFg: '#4a535b',
      border: '#d6d6ce',
    },
    font: {
      sans: "'Hanken Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      serif: "'Newsreader', ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.25,
      baseSize: '1.0625rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.0625rem', md: '0.125rem', lg: '0.1875rem' },
    motion: { duration: '140ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 0 rgba(15, 26, 36, 0.06)', md: '0 8px 24px rgba(15, 26, 36, 0.12)' },
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
