/**
 * A small QR Code encoder: byte mode, error-correction level M, versions 1 to
 * 10 (up to 213 bytes) — what an `otpauth://` enrolment link needs, with no
 * dependency (R9). The layout, the Reed-Solomon arithmetic and the mask
 * scoring follow ISO/IEC 18004; the structure of the tables follows Project
 * Nayuki's reference implementation (MIT).
 */

/** Data codewords' error-correction length per block, level M, versions 1..10. */
const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26] as const
/** Number of error-correction blocks, level M, versions 1..10. */
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] as const
const MAX_VERSION = 10

/** Format information's two-bit error-correction indicator for level M. */
const FORMAT_ECL_M = 0

export class QrTooLongError extends Error {
  constructor(length: number) {
    super(`The text is ${length} bytes long; this encoder holds at most 213.`)
    this.name = 'QrTooLongError'
  }
}

function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2
    result -= (25 * align - 10) * align - 55
    if (version >= 7) result -= 36
  }
  return result
}

function dataCodewords(version: number): number {
  const index = version - 1
  return (
    Math.floor(rawDataModules(version) / 8) -
    (ECC_PER_BLOCK[index] as number) * (BLOCKS[index] as number)
  )
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const size = version * 4 + 17
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2
  const result = [6]
  for (let position = size - 7; result.length < count; position -= step) {
    result.splice(1, 0, position)
  }
  return result
}

// ---- Reed-Solomon over GF(256), modulus 0x11D ----------------------------

function gfMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j] as number, root)
      if (j + 1 < result.length) result[j] = (result[j] as number) ^ (result[j + 1] as number)
    }
    root = gfMultiply(root, 0x02)
  }
  return result
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0)
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number)
    result.push(0)
    divisor.forEach((coefficient, i) => {
      result[i] = (result[i] as number) ^ gfMultiply(coefficient, factor)
    })
  }
  return result
}

// ---- Matrix --------------------------------------------------------------

class Matrix {
  readonly version: number
  readonly size: number
  readonly modules: boolean[][]
  readonly reserved: boolean[][]

  constructor(version: number) {
    this.version = version
    this.size = version * 4 + 17
    this.modules = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    )
    this.reserved = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    )
  }

  set(x: number, y: number, dark: boolean): void {
    ;(this.modules[y] as boolean[])[x] = dark
    ;(this.reserved[y] as boolean[])[x] = true
  }

  get(x: number, y: number): boolean {
    return (this.modules[y] as boolean[])[x] as boolean
  }

  isReserved(x: number, y: number): boolean {
    return (this.reserved[y] as boolean[])[x] as boolean
  }

  drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i += 1) {
      this.set(6, i, i % 2 === 0)
      this.set(i, 6, i % 2 === 0)
    }
    this.finder(3, 3)
    this.finder(this.size - 4, 3)
    this.finder(3, this.size - 4)
    const positions = alignmentPositions(this.version)
    const last = positions.length - 1
    positions.forEach((cy, i) => {
      positions.forEach((cx, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
          }
        }
      })
    })
    this.drawFormat(0)
    this.drawVersion()
  }

  private finder(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy))
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
          this.set(x, y, distance !== 2 && distance !== 4)
        }
      }
    }
  }

  drawFormat(mask: number): void {
    const data = (FORMAT_ECL_M << 3) | mask
    let remainder = data
    for (let i = 0; i < 10; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
    const bits = ((data << 10) | remainder) ^ 0x5412
    const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i += 1) this.set(8, i, bit(i))
    this.set(8, 7, bit(6))
    this.set(8, 8, bit(7))
    this.set(7, 8, bit(8))
    for (let i = 9; i < 15; i += 1) this.set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i += 1) this.set(this.size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i += 1) this.set(8, this.size - 15 + i, bit(i))
    this.set(8, this.size - 8, true)
  }

  private drawVersion(): void {
    if (this.version < 7) return
    let remainder = this.version
    for (let i = 0; i < 12; i += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25)
    const bits = (this.version << 12) | remainder
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) !== 0
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.set(a, b, dark)
      this.set(b, a, dark)
    }
  }

  drawCodewords(codewords: readonly number[]): void {
    let i = 0
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < this.size; vert += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vert : vert
          if (!this.isReserved(x, y) && i < codewords.length * 8) {
            ;(this.modules[y] as boolean[])[x] =
              (((codewords[i >>> 3] as number) >>> (7 - (i & 7))) & 1) !== 0
            i += 1
          }
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (this.isReserved(x, y)) continue
        let invert: boolean
        switch (mask) {
          case 0:
            invert = (x + y) % 2 === 0
            break
          case 1:
            invert = y % 2 === 0
            break
          case 2:
            invert = x % 3 === 0
            break
          case 3:
            invert = (x + y) % 3 === 0
            break
          case 4:
            invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
            break
          case 5:
            invert = ((x * y) % 2) + ((x * y) % 3) === 0
            break
          case 6:
            invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
            break
          default:
            invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
        }
        if (invert) (this.modules[y] as boolean[])[x] = !this.get(x, y)
      }
    }
  }

  /** ISO 18004's four penalty rules, summed — the lower, the easier to scan. */
  penalty(): number {
    const { size } = this
    let total = 0
    const lines: boolean[][] = []
    for (let y = 0; y < size; y += 1) lines.push(this.modules[y] as boolean[])
    for (let x = 0; x < size; x += 1) lines.push(this.modules.map((row) => row[x] as boolean))
    for (const line of lines) {
      let run = 1
      for (let i = 1; i <= size; i += 1) {
        if (i < size && line[i] === line[i - 1]) {
          run += 1
        } else {
          if (run >= 5) total += run - 2
          run = 1
        }
      }
      // Finder-like 1:1:3:1:1 patterns with four light modules on a side.
      for (let i = 0; i + 11 <= size; i += 1) {
        const window = line
          .slice(i, i + 11)
          .map((bit) => (bit ? '1' : '0'))
          .join('')
        if (window === '10111010000' || window === '00001011101') total += 40
      }
    }
    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const color = this.get(x, y)
        if (
          color === this.get(x + 1, y) &&
          color === this.get(x, y + 1) &&
          color === this.get(x + 1, y + 1)
        ) {
          total += 3
        }
      }
    }
    const dark = this.modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0)
    const percent = (dark * 100) / (size * size)
    total += Math.floor(Math.abs(percent - 50) / 5) * 10
    return total
  }
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text))
}

/** The QR Code for `text`, as rows of dark (`true`) and light modules, quiet zone excluded. */
export function encodeQr(text: string): readonly (readonly boolean[])[] {
  const bytes = utf8(text)
  let version = 1
  while (version <= MAX_VERSION) {
    const countBits = version < 10 ? 8 : 16
    if (4 + countBits + bytes.length * 8 <= dataCodewords(version) * 8) break
    version += 1
  }
  if (version > MAX_VERSION) throw new QrTooLongError(bytes.length)

  // Bit stream: mode (byte = 0100), character count, data, terminator, padding.
  const bits: number[] = []
  const push = (value: number, length: number): void => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, version < 10 ? 8 : 16)
  for (const byte of bytes) push(byte, 8)
  const capacityBits = dataCodewords(version) * 8
  push(0, Math.min(4, capacityBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0))
  }
  for (let pad = 0xec; data.length < dataCodewords(version); pad ^= 0xec ^ 0x11) data.push(pad)

  // Split into blocks, add error correction, interleave.
  const index = version - 1
  const blockCount = BLOCKS[index] as number
  const eccLength = ECC_PER_BLOCK[index] as number
  const totalCodewords = Math.floor(rawDataModules(version) / 8)
  const shortBlocks = blockCount - (totalCodewords % blockCount)
  const shortBlockLength = Math.floor(totalCodewords / blockCount)
  const divisor = rsDivisor(eccLength)
  const blocks: number[][] = []
  for (let i = 0, offset = 0; i < blockCount; i += 1) {
    const length = shortBlockLength - eccLength + (i < shortBlocks ? 0 : 1)
    const chunk = data.slice(offset, offset + length)
    offset += length
    const ecc = rsRemainder(chunk, divisor)
    if (i < shortBlocks) chunk.push(0)
    blocks.push([...chunk, ...ecc])
  }
  const interleaved: number[] = []
  const blockLength = (blocks[0] as number[]).length
  for (let i = 0; i < blockLength; i += 1) {
    blocks.forEach((block, j) => {
      // The pad byte of a short block is not a codeword.
      if (i !== shortBlockLength - eccLength || j >= shortBlocks)
        interleaved.push(block[i] as number)
    })
  }

  // Draw, then pick the mask that scores best.
  let best: Matrix | null = null
  let bestScore = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = new Matrix(version)
    matrix.drawFunctionPatterns()
    matrix.drawCodewords(interleaved)
    matrix.applyMask(mask)
    matrix.drawFormat(mask)
    const score = matrix.penalty()
    if (score < bestScore) {
      best = matrix
      bestScore = score
    }
  }
  return (best as Matrix).modules
}
