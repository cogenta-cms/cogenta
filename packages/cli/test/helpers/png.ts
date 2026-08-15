import { crc32, deflateSync } from 'node:zlib'

/**
 * A real, valid PNG of the requested size — built here rather than checked in.
 *
 * The image pipeline decodes what it is given, so a test that feeds it a
 * placeholder byte string proves nothing. A fixture file would work too, but
 * the tests need *several* sizes (below the ladder, across it, wide enough to
 * exercise the cap), and one function is smaller than a folder of binaries.
 *
 * 8-bit RGB, no interlacing, one `IDAT`. Nothing here is clever: it is the
 * minimum a decoder accepts.
 */
export function makePng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(2, 9) // colour type: truecolour
  ihdr.writeUInt8(0, 10) // compression
  ihdr.writeUInt8(0, 11) // filter
  ihdr.writeUInt8(0, 12) // interlace

  // One filter byte per scanline, then RGB triplets. A gradient rather than a
  // flat colour so an encoder cannot collapse the whole thing to nothing and
  // make a "did it really resize?" assertion vacuous.
  const raw = Buffer.alloc(height * (1 + width * 3))
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    raw.writeUInt8(0, offset) // filter: none
    offset += 1
    for (let x = 0; x < width; x += 1) {
      raw.writeUInt8((x * 7) % 256, offset)
      raw.writeUInt8((y * 11) % 256, offset + 1)
      raw.writeUInt8((x + y) % 256, offset + 2)
      offset += 3
    }
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(typed) >>> 0, 0)
  return Buffer.concat([length, typed, checksum])
}
