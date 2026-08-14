import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  localStorage.clear()
  // `BrowserRouter` reads real `window.history`, which jsdom keeps across
  // tests in the same file — without this, a test that navigates leaves the
  // next test's `<App />` mounting wherever that one ended up.
  window.history.pushState(null, '', '/')
})
