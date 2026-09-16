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
 * `@cogenta/theme-canonical`'s own default (`create-cogenta`'s `scaffold.ts`'s
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
   * The documentation of a developer tool (`@cogenta/theme-docs`, L27 studio
   * pass): white and a cool grey scale, a near-black ink, and one deep petrol
   * teal kept for links, the current page and focus; IBM Plex Sans for
   * everything a reader reads and IBM Plex Mono for code. Copied from
   * `packages/theme-docs/tokens.json` rather than referenced (a blueprint's
   * starting skin and a theme's own default skin are two independent pieces
   * of data the contract keeps separate), so a scaffolded `documentation`
   * site's skin names the theme's own typefaces and palette from the first
   * render.
   */
  documentation: {
    color: {
      bg: '#ffffff',
      fg: '#15191f',
      accent: '#006877',
      accentFg: '#ffffff',
      muted: '#f3f5f7',
      mutedFg: '#535c68',
      border: '#dde2e8',
    },
    font: {
      sans: "'IBM Plex Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      scale: 1.2,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.1875rem', md: '0.3125rem', lg: '0.375rem' },
    motion: { duration: '120ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 0 rgba(21, 25, 31, 0.05)', md: '0 8px 24px rgba(21, 25, 31, 0.08)' },
  },

  /**
   * A small brand of durable everyday goods (`@cogenta/theme-ecommerce`, L27
   * studio pass): a sand ground, warm ink, a stone surface for bands and the
   * footer, and one terracotta kept for a few details. Albert Sans sets
   * everything. Identical to `packages/theme-ecommerce/tokens.json`, so a new
   * shop starts in the theme's own identity.
   */
  store: {
    color: {
      bg: '#f4f0ea',
      fg: '#221e1a',
      accent: '#9a4a2e',
      accentFg: '#ffffff',
      muted: '#e8e2d8',
      mutedFg: '#5c554c',
      border: '#d5ccbf',
    },
    font: {
      sans: "'Albert Sans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      scale: 1.2,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0rem', md: '0.125rem', lg: '0.25rem' },
    motion: { duration: '140ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: {
      sm: '0 1px 0 rgba(34, 30, 26, 0.06)',
      md: '0 8px 24px rgba(34, 30, 26, 0.1)',
    },
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
   * B2B software for finance and operations teams (`@cogenta/theme-saas`,
   * L27 studio pass): white and a structured grey scale, a near-black ink and
   * one signal blue kept for links, focus and the primary button; Geist for
   * everything a visitor reads and Geist Mono for identifiers, figures and
   * labels. Copied from `packages/theme-saas/tokens.json` rather than
   * referenced (a blueprint's starting skin and a theme's own default skin
   * are two independent pieces of data the contract keeps separate), so a
   * scaffolded `saas` site's skin names the theme's own typefaces and palette
   * from the first render: the theme reads both from the skin, and a skin
   * that named other fonts would silently replace them.
   */
  saas: {
    color: {
      bg: '#ffffff',
      fg: '#111113',
      accent: '#0068d5',
      accentFg: '#ffffff',
      muted: '#f4f4f5',
      mutedFg: '#5c5c66',
      border: '#e4e4e7',
    },
    font: {
      sans: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      serif: "ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "'Geist Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      scale: 1.25,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.25rem', md: '0.375rem', lg: '0.5rem' },
    motion: { duration: '120ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 0 rgba(17, 17, 19, 0.05)', md: '0 8px 24px rgba(17, 17, 19, 0.08)' },
  },
  /**
   * A contemporary bistro (`@cogenta/theme-restaurant`, L27 studio pass): a
   * warm cream paper, a deep charcoal ink and one brass kept for a few
   * details; Cormorant Garamond for the house's voice (the name, titles, dish
   * names) and Karla for everything a guest reads to find their way. Copied
   * from `packages/theme-restaurant/tokens.json` rather than referenced (a
   * blueprint's starting skin and a theme's own default skin are two
   * independent pieces of data the contract keeps separate), so a scaffolded
   * `restaurant` site's skin names the theme's own typefaces and palette from
   * the first render: the theme reads both from the skin, and a skin that
   * named other fonts would silently replace them.
   */
  restaurant: {
    color: {
      bg: '#f4efe6',
      fg: '#1f1c18',
      accent: '#7b5b1f',
      accentFg: '#ffffff',
      muted: '#e9e2d5',
      mutedFg: '#595247',
      border: '#d9cfbf',
    },
    font: {
      sans: "'Karla', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      serif: "'Cormorant Garamond', ui-serif, Georgia, Cambria, 'Times New Roman', serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      scale: 1.25,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0rem', md: '0rem', lg: '0.125rem' },
    motion: { duration: '140ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 0 rgba(31, 28, 24, 0.06)', md: '0 8px 24px rgba(31, 28, 24, 0.1)' },
  },
  /**
   * An engineering company (`@cogenta/theme-entreprise`, L36): a cool grey
   * paper, a blue-black ink and one signal green, the colour of a healthy
   * reading in its own product; Geist for display and text, Geist Mono for
   * labels and figures. Copied from `packages/theme-entreprise/tokens.json`
   * rather than referenced, so a scaffolded `vitrine` site's skin names the
   * theme's own typefaces and palette from the first render.
   */
  vitrine: {
    color: {
      bg: '#f4f4f2',
      fg: '#0c0f14',
      accent: '#087044',
      accentFg: '#ffffff',
      muted: '#e8e8e4',
      mutedFg: '#4b525a',
      border: '#d7d8d3',
    },
    font: {
      sans: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      serif:
        "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      mono: "'Geist Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
      scale: 1.25,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.0625rem', md: '0.125rem', lg: '0.1875rem' },
    motion: { duration: '140ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 0 rgba(12, 15, 20, 0.06)', md: '0 8px 24px rgba(12, 15, 20, 0.12)' },
  },
  /**
   * A neighbourhood charity (L27, `@cogenta/theme-association`): warm paper,
   * a green-black ink and one deep green, the organisation's own colour; the
   * theme derives the donation yellow from the paper's hue. Bricolage
   * Grotesque in the display slot (`serif`, which the theme reads as its
   * display face) and Source Sans 3 for text. Identical to the theme's own
   * `tokens.json`, checked by test.
   */
  association: {
    color: {
      bg: '#f7f3ea',
      fg: '#17201a',
      accent: '#1d5b3e',
      accentFg: '#f7f3ea',
      muted: '#ede6d6',
      mutedFg: '#4b4f47',
      border: '#d8cfbc',
    },
    font: {
      sans: "'Source Sans 3', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      serif:
        "'Bricolage Grotesque', 'Source Sans 3', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
      mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      scale: 1.25,
      baseSize: '1.0625rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '0.1875rem', md: '0.25rem', lg: '0.375rem' },
    motion: { duration: '140ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 0 rgba(23, 32, 26, 0.06)', md: '0 6px 18px rgba(23, 32, 26, 0.08)' },
  },
}
