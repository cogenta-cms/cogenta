// A real, minimal Cogenta plugin manifest — hand-written `.mjs`, not compiled
// from TypeScript. `loadPlugin` (`@cogenta/plugins`) imports this file
// directly, exactly as it would from a real installed plugin package, so it
// must run as-is with no build step — the same reasoning `cogenta.config.mjs`
// and `sandbox-entry.mjs` are hand-written elsewhere in this project.
//
// This is the "modèle de démarrage" docs/guide-plugin.md links to. It asks
// for the smallest capability set that does something real: read content,
// and read/write its own confined storage prefix. Copy this file, rename the
// plugin, and narrow or widen `capabilities` to what your plugin actually
// needs — "commencer minimal" (docs/lots/L7-extensibilite.md § Pièges
// connus): a plugin that asks for more than it uses is harder for a user to
// trust and for you to justify on the permissions screen.

import { definePlugin } from '@cogenta/plugins'

export default definePlugin({
  name: '@example/plugin-starter',
  version: '1.0.0',
  engine: '^1.0.0',

  capabilities: [
    'content.read',
    'storage.read:plugins/plugin-starter',
    'storage.write:plugins/plugin-starter',
  ],

  provides: {
    tools: ['plugin-starter.hello'],
  },

  runtime: 'server',
  isolated: true,
})
