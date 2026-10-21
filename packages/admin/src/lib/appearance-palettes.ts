/**
 * Ready-made colour palettes for the site "Apparence" editor. Each one fills
 * the seven colour tokens of contract D and nothing else, so applying one is
 * an ordinary edit of the draft: previewed live, saved only on request, and
 * undone by leaving without saving. They all pass the same WCAG AA pairs the
 * server enforces — a test measures that, so a palette can never be offered
 * and then refused on save.
 */

export interface PalettePreset {
  readonly id: string
  readonly dark: boolean
  readonly colors: {
    readonly bg: string
    readonly fg: string
    readonly accent: string
    readonly accentFg: string
    readonly muted: string
    readonly mutedFg: string
    readonly border: string
  }
}

export const PALETTE_PRESETS: readonly PalettePreset[] = [
  {
    id: 'ink',
    dark: false,
    colors: {
      bg: '#f6f5f1',
      fg: '#14161a',
      accent: '#1f4fd8',
      accentFg: '#ffffff',
      muted: '#e9e8e2',
      mutedFg: '#4a4d55',
      border: '#d6d4cb',
    },
  },
  {
    id: 'forest',
    dark: false,
    colors: {
      bg: '#f4f6f1',
      fg: '#12201a',
      accent: '#1f6b46',
      accentFg: '#ffffff',
      muted: '#e3e9df',
      mutedFg: '#46544c',
      border: '#cdd6c9',
    },
  },
  {
    id: 'terracotta',
    dark: false,
    colors: {
      bg: '#faf5ef',
      fg: '#2a1b14',
      accent: '#b4441c',
      accentFg: '#ffffff',
      muted: '#f0e4d6',
      mutedFg: '#5c4636',
      border: '#e0cfbb',
    },
  },
  {
    id: 'plum',
    dark: false,
    colors: {
      bg: '#faf6fa',
      fg: '#1d1220',
      accent: '#7a2a8c',
      accentFg: '#ffffff',
      muted: '#efe4f1',
      mutedFg: '#5b4660',
      border: '#dcc9e0',
    },
  },
  {
    id: 'sand',
    dark: false,
    colors: {
      bg: '#f7f3ea',
      fg: '#231f16',
      accent: '#0f6e6e',
      accentFg: '#ffffff',
      muted: '#ebe4d3',
      mutedFg: '#5a5240',
      border: '#d9cfb8',
    },
  },
  {
    id: 'contrast',
    dark: false,
    colors: {
      bg: '#ffffff',
      fg: '#000000',
      accent: '#0000cc',
      accentFg: '#ffffff',
      muted: '#f0f0f0',
      mutedFg: '#333333',
      border: '#767676',
    },
  },
  {
    id: 'ocean-night',
    dark: true,
    colors: {
      bg: '#0f1722',
      fg: '#e8eef6',
      accent: '#5aa9ff',
      accentFg: '#08121f',
      muted: '#1a2536',
      mutedFg: '#a6b4c6',
      border: '#2a3a52',
    },
  },
  {
    id: 'graphite',
    dark: true,
    colors: {
      bg: '#131416',
      fg: '#ececec',
      accent: '#f2b84b',
      accentFg: '#1a1303',
      muted: '#1f2023',
      mutedFg: '#a3a5aa',
      border: '#34363a',
    },
  },
]
