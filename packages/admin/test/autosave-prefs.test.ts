import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadAutosaveEnabled,
  saveAutosaveEnabled,
  useAutosaveEnabled,
} from '../src/lib/autosave-prefs.js'

describe('the autosave preference (per-browser, never a server setting)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("is on by default, matching today's behaviour, until someone turns it off", () => {
    expect(loadAutosaveEnabled()).toBe(true)
  })

  it('remembers an explicit off', () => {
    saveAutosaveEnabled(false)
    expect(loadAutosaveEnabled()).toBe(false)
  })

  it('remembers an explicit on, after having been off', () => {
    saveAutosaveEnabled(false)
    saveAutosaveEnabled(true)
    expect(loadAutosaveEnabled()).toBe(true)
  })

  it('works with no memory at all when storage is denied', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    try {
      expect(loadAutosaveEnabled()).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('does not throw when storage refuses a write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    try {
      expect(() => saveAutosaveEnabled(false)).not.toThrow()
    } finally {
      spy.mockRestore()
    }
  })

  it('useAutosaveEnabled reads the stored value on mount and persists every change', () => {
    saveAutosaveEnabled(false)
    const { result } = renderHook(() => useAutosaveEnabled())
    expect(result.current[0]).toBe(false)

    act(() => {
      result.current[1](true)
    })
    expect(result.current[0]).toBe(true)
    expect(loadAutosaveEnabled()).toBe(true)
  })
})
