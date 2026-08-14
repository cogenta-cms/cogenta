// Hostile fixture (L7 task 3): attempts to read a specific secret the host
// process holds, via `process.env`. Distinct from process-escape.js: this
// proves secret-isolation specifically, not just generic `process` access.
;(() => {
  try {
    return { escaped: true, secret: process.env.COGENTA_TEST_SECRET }
  } catch (error) {
    return { escaped: false, message: error.message }
  }
})()
