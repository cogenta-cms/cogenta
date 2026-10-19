import { describe, expect, it } from 'vitest'
import { ADMIN_THEME_TEMPLATES } from '../../src/store/admin-theme-templates.js'

type Color = readonly [number, number, number, number]

/** CSS Color 4 conversion, including alpha compositing of the badge surfaces. */
function color(value: string): Color {
  if (value.startsWith('#')) {
    return [
      Number.parseInt(value.slice(1, 3), 16) / 255,
      Number.parseInt(value.slice(3, 5), 16) / 255,
      Number.parseInt(value.slice(5, 7), 16) / 255,
      1,
    ]
  }
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+)%)?\)$/u.exec(value)
  if (match === null) throw new Error(`Unsupported test color: ${value}`)
  const lightness = Number(match[1])
  const chroma = Number(match[2])
  const angle = (Number(match[3]) * Math.PI) / 180
  const a = chroma * Math.cos(angle)
  const b = chroma * Math.sin(angle)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const encode = (channel: number): number => {
    const clamped = Math.min(1, Math.max(0, channel))
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
  }
  return [
    encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    match[4] === undefined ? 1 : Number(match[4]) / 100,
  ]
}

function composite(front: Color, back: Color): Color {
  return [
    front[0] * front[3] + back[0] * (1 - front[3]),
    front[1] * front[3] + back[1] * (1 - front[3]),
    front[2] * front[3] + back[2] * (1 - front[3]),
    1,
  ]
}

function luminance(value: Color): number {
  const linear = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  return 0.2126 * linear(value[0]) + 0.7152 * linear(value[1]) + 0.0722 * linear(value[2])
}

function contrast(front: Color, back: Color): number {
  const first = luminance(front)
  const second = luminance(back)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

describe('built-in admin status badge contrast', () => {
  for (const template of ADMIN_THEME_TEMPLATES)
    for (const scheme of ['light', 'dark'] as const) {
      it(`${template.id} ${scheme} keeps normal status text readable on badges and buttons`, () => {
        const tokens = template[scheme]
        for (const tone of ['success', 'warning', 'info'] as const) {
          const foreground = color(tokens[tone])
          for (const background of [tokens.card, tokens.background]) {
            const surface = composite(color(tokens[`${tone}Surface`]), color(background))
            expect(
              contrast(foreground, surface),
              `${tone} on ${background}`,
            ).toBeGreaterThanOrEqual(4.5)
          }
          expect(
            contrast(color(tokens[`${tone}Foreground`]), foreground),
            `${tone} button`,
          ).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
})
