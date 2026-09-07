// Proves runIsolatedModule's worker-level protections apply identically to
// a real ES module import as they already do to runIsolated's classic
// script — `env: {}` is a Worker constructor option, not something either
// guest entry has to enforce itself.
export function checkEnv() {
  return { envKeys: Object.keys(process.env), value: process.env.COGENTA_TEST_SECRET ?? null }
}
