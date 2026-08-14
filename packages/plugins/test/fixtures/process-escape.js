// Hostile fixture (L7 task 3): attempts to reach the `process` global.
;(() => {
  try {
    return { escaped: true, hasEnv: typeof process.env }
  } catch (error) {
    return { escaped: false, message: error.message }
  }
})()
