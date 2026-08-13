import { randomFillSync } from 'node:crypto'

/**
 * UUIDv7 generation, per ADR-0015: every content id is minted by the
 * application, never by the database.
 *
 * Node exposes `randomUUID`, which is v4 only — there is no v7 in the standard
 * library as of Node 24 — so the layout below is written out by hand against
 * RFC 9562 §5.7 rather than pulling in a dependency for sixteen bytes (rule R9).
 *
 *   0..5   unix timestamp in milliseconds, big-endian, 48 bits
 *   6..7   version (7) in the high nibble, then a 12-bit sequence counter
 *   8      variant (0b10) in the two high bits, then 6 random bits
 *   9..15  random, 56 bits
 *
 * v4 is not an option here: random ids fragment a B-tree index on insert, and
 * the write cost grows with the table. v7 sorts by creation time, so new rows
 * land at the end of the index.
 */

const MAX_SEQUENCE = 0xfff

/**
 * Ids minted inside the same millisecond stay ordered because the 12-bit
 * `rand_a` field is used as a counter (RFC 9562 §6.2, "monotonic random"
 * method 1). Without it, two rows created in the same tick sort at random —
 * which breaks pagination by id, the very reason for choosing v7.
 */
let lastTimestamp = -1
let sequence = 0

/** Random bytes for the low 62 bits. Refilled per call, never reused. */
const randomBytes = new Uint8Array(8)

export function newId(now: () => number = Date.now): string {
  const timestamp = now()

  if (timestamp === lastTimestamp) {
    sequence += 1
    if (sequence > MAX_SEQUENCE) {
      // More than 4096 ids in one millisecond: borrow from the next one rather
      // than emit a duplicate. Time-ordering is preserved, the clock is not.
      lastTimestamp += 1
      sequence = 0
    }
  } else {
    // A clock that steps backwards must not produce ids that sort before rows
    // already written, so the last timestamp only ever moves forward.
    lastTimestamp = timestamp > lastTimestamp ? timestamp : lastTimestamp + 1
    sequence = 0
  }

  randomFillSync(randomBytes)

  const bytes = new Uint8Array(16)
  const millis = lastTimestamp
  bytes[0] = Math.floor(millis / 2 ** 40) & 0xff
  bytes[1] = Math.floor(millis / 2 ** 32) & 0xff
  bytes[2] = Math.floor(millis / 2 ** 24) & 0xff
  bytes[3] = Math.floor(millis / 2 ** 16) & 0xff
  bytes[4] = Math.floor(millis / 2 ** 8) & 0xff
  bytes[5] = millis & 0xff
  bytes[6] = 0x70 | ((sequence >>> 8) & 0x0f)
  bytes[7] = sequence & 0xff
  bytes[8] = 0x80 | ((randomBytes[0] ?? 0) & 0x3f)
  for (let index = 9; index < 16; index += 1) {
    bytes[index] = randomBytes[index - 8] ?? 0
  }

  return formatUuid(bytes)
}

const HEX: readonly string[] = Array.from({ length: 256 }, (_, byte) =>
  byte.toString(16).padStart(2, '0'),
)

function formatUuid(bytes: Uint8Array): string {
  let text = ''
  for (let index = 0; index < 16; index += 1) {
    if (index === 4 || index === 6 || index === 8 || index === 10) text += '-'
    text += HEX[bytes[index] ?? 0]
  }
  return text
}

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function isUuidV7(value: string): boolean {
  return UUID_V7_PATTERN.test(value)
}

/** The millisecond an id was minted, readable without a database round-trip. */
export function timestampOf(id: string): number {
  return Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)
}
