// Processes the five Wikimedia Commons originals the `saas` blueprint bundles.
//
//   node packages/starters/scripts/saas-assets/photos.mjs <folder with the downloaded originals>
//
// The originals are the files named in `src/blueprints/saas-credits.ts` (`source`), downloaded
// from upload.wikimedia.org. Each is rotated by its EXIF orientation, cropped as the table below
// says (fractions of the original frame), resized and saved as a progressive JPEG without metadata.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// sharp is a dependency of @cogenta/render, not of this package: resolve it from there.
const sharp = createRequire(new URL('../../../render/package.json', import.meta.url))('sharp')

const input = process.argv[2]
if (input === undefined) throw new Error('usage: photos.mjs <folder of originals>')
const out = fileURLToPath(new URL('../../src/blueprints/assets/photos/saas/', import.meta.url))

// [original, output, left, top, width, height (fractions), output width, quality]
const photos = [
  ['dc1.jpg', 'security-racks.jpg', 0, 0, 1, 1, 1600, 72],
  ['londoncity.jpg', 'office-london.jpg', 0, 0.28, 1, 0.61, 1600, 72],
  ['toronto2.jpg', 'office-toronto.jpg', 0, 0.08, 1, 0.7, 1600, 74],
  ['paris.jpg', 'office-paris.jpg', 0, 0.04, 1, 0.92, 1600, 72],
  ['montreal4.jpg', 'office-montreal.jpg', 0.25, 0.15, 0.75, 0.85, 1600, 72],
]

for (const [file, name, left, top, width, height, outWidth, quality] of photos) {
  const oriented = await sharp(`${input}/${file}`).rotate().toBuffer()
  const meta = await sharp(oriented).metadata()
  const w = meta.width
  const h = meta.height
  await sharp(oriented)
    .extract({
      left: Math.round(left * w),
      top: Math.round(top * h),
      width: Math.round(width * w),
      height: Math.round(height * h),
    })
    .resize({ width: outWidth, withoutEnlargement: true })
    .jpeg({ quality, progressive: true, mozjpeg: true })
    .toFile(`${out}${name}`)
}
