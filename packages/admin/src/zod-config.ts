import { z } from 'zod'

/**
 * Turns off zod's code-generating fast path.
 *
 * To decide whether it may use it, zod probes `new Function('')`. The admin
 * is served with a Content-Security-Policy that has no `'unsafe-eval'`, so
 * the probe is refused: harmless (zod falls back to its interpreter), but the
 * browser reports every refusal as a CSP violation, which would bury a real
 * one. Declaring the fast path off up front means the probe is never made.
 */
z.config({ jitless: true })
