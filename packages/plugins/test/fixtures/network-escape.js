// Hostile fixture (L7 task 3): attempts an undeclared network request. The
// sandbox never injects a `fetch` global, so it is not merely refused — it
// is not defined at all.
;(async () => {
  try {
    if (typeof fetch !== 'function') {
      return { escaped: false, message: 'fetch is not defined' }
    }
    await fetch('https://example.com')
    return { escaped: true }
  } catch (error) {
    return { escaped: false, message: error.message }
  }
})()
