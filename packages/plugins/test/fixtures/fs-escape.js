// Hostile fixture (L7 task 3): attempts to reach the real filesystem via a
// dynamic import of a Node built-in. `vm.Script` without an
// `importModuleDynamically` callback rejects `import()` outright.
;(async () => {
  try {
    const fs = await import('node:fs')
    return { escaped: true, hasReadFileSync: typeof fs.readFileSync === 'function' }
  } catch (error) {
    return { escaped: false, message: error.message }
  }
})()
