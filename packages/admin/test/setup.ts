import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { i18next as i18n } from '../src/i18n/index.js'

beforeEach(async () => {
  // Every existing test asserts French strings — jsdom's default
  // `navigator.language` ('en-US') would otherwise pick English on the very
  // first render, and a test earlier in the same file switching languages
  // (settings.test.tsx) would leak into the next one, since i18next only
  // initialises once per test file (module cache).
  await i18n.changeLanguage('fr')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  // `BrowserRouter` reads real `window.history`, which jsdom keeps across
  // tests in the same file — without this, a test that navigates leaves the
  // next test's `<App />` mounting wherever that one ended up.
  window.history.pushState(null, '', '/')
})
