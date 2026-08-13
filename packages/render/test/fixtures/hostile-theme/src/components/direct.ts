// Vector 2: the unprefixed spelling of a builtin, an aliased binding, and the
// core package — three ways of saying the same thing to a naive checker.
import fs from 'fs'
import { readFile as read } from 'fs/promises'
import { CogentaError } from '@cogenta/core'

export { defineCollection } from '@cogenta/schema'

export function leak(): string {
  if (fs === undefined) throw new CogentaError({ code: 'INTERNAL', message: 'no fs' })
  return String(read)
}
