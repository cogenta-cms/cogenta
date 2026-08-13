// Vector 5: CommonJS smuggled back into an ESM theme. `node:module` is not on
// the contract's forbidden list, which is exactly why the call shape itself is
// refused rather than the specifier.
import { createRequire } from 'node:module'

const load = createRequire(import.meta.url)

export const net = load('node:net')
export const child = load('child_process')
