import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { i18next as i18n } from '../src/i18n/index.js'

// `waitFor` and `findBy*` keep their own one-second budget, which the
// package's `testTimeout` does not cover: a test can sit well inside its
// twenty seconds and still fail because a single `waitFor` gave up after one.
// That reports as the last assertion that did not hold — "expected false to
// be true" — which says nothing about the real cause, and only ever happens
// on a loaded runner. Five seconds is still short enough that a genuinely
// broken expectation fails quickly.
configure({ asyncUtilTimeout: 5000 })

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
