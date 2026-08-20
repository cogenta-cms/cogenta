/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // One PR = one subject (AGENTS.md § Conventions).
    'scope-enum': [
      2,
      'always',
      [
        'core',
        'cli',
        'schema',
        'api',
        'blocks',
        'admin',
        'auth',
        'render',
        'theme-canonical',
        'agents',
        'mcp',
        'create',
        'import',
        'channels',
        'plugins',
        'fleet',
        'commerce',
        'comments',
        'analytics',
        'db',
        'cache',
        'queue',
        'storage',
        'config',
        'ci',
        'deps',
        'docs',
        'repo',
      ],
    ],
    'scope-empty': [1, 'never'],
    'body-max-line-length': [2, 'always', 100],
    // Acronyms are everywhere here (CI, API, SQL, MCP, SEO, CVE): forbid title-casing
    // the subject rather than requiring it to be entirely lower-case.
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
  },
}
