import { describe, expect, it } from 'vitest'
import {
  clampRect,
  FULL_CROP,
  moveRect,
  rectForRatio,
  resizeRect,
  turned,
} from '../../src/media/image-edit-geometry.js'

/** L39: the crop frame stays inside the picture and keeps the ratio it was given, in pixels. */

const LANDSCAPE = { width: 1600, height: 900 }

describe('the crop frame', () => {
  it('swaps a picture’s sides on a quarter turn', () => {
    expect(turned(LANDSCAPE, 90)).toEqual({ width: 900, height: 1600 })
    expect(turned(LANDSCAPE, 180)).toEqual(LANDSCAPE)
  })

  it('is the largest centred frame of a ratio, and the whole picture when free', () => {
    const square = rectForRatio('1:1', LANDSCAPE)
    expect(square.height).toBe(1)
    expect(square.width * LANDSCAPE.width).toBeCloseTo(square.height * LANDSCAPE.height, 0)
    expect(square.x).toBeCloseTo((1 - square.width) / 2)
    expect(rectForRatio('free', LANDSCAPE)).toEqual(FULL_CROP)
    expect(rectForRatio('16:9', LANDSCAPE)).toEqual(FULL_CROP)
  })

  it('stops at the picture’s edges when moved', () => {
    const frame = { x: 0.5, y: 0.5, width: 0.4, height: 0.4 }
    expect(moveRect(frame, 0.5, 0.5)).toEqual({ x: 0.6, y: 0.6, width: 0.4, height: 0.4 })
    expect(moveRect(frame, -1, -1)).toEqual({ x: 0, y: 0, width: 0.4, height: 0.4 })
  })

  it('holds the opposite corner when resized, and never shrinks to nothing', () => {
    const frame = { x: 0.2, y: 0.2, width: 0.5, height: 0.5 }
    const grown = resizeRect(frame, 'nw', -0.1, -0.1, 'free', LANDSCAPE)
    expect(grown.x + grown.width).toBeCloseTo(0.7)
    expect(grown.y + grown.height).toBeCloseTo(0.7)
    expect(resizeRect(frame, 'se', -1, -1, 'free', LANDSCAPE).width).toBe(0.05)
  })

  it('keeps a fixed ratio in pixels while resizing', () => {
    const square = rectForRatio('1:1', LANDSCAPE)
    const resized = resizeRect(square, 'se', -0.1, 0, '1:1', LANDSCAPE)
    expect(resized.width * LANDSCAPE.width).toBeCloseTo(resized.height * LANDSCAPE.height, 0)
  })

  it('is clamped into the picture', () => {
    expect(clampRect({ x: 0.9, y: -0.2, width: 0.5, height: 2 })).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 1,
    })
  })
})
