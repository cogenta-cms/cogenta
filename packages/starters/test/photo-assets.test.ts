import { describe, expect, it } from 'vitest'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import { logoArt } from '../src/demo-art/compositions.js'
import { renderArt } from '../src/demo-art/render.js'

describe('bundled demo image assets', () => {
  it('labels a bundled photograph as the JPEG it is', () => {
    const photo = loadPhotoAsset('restaurant/hero.jpg')
    expect(photo).toBeDefined()
    expect(bundledImageType(photo as Uint8Array)).toEqual({
      extension: 'jpg',
      mimeType: 'image/jpeg',
    })
  })

  it('labels a PNG, such as a wordmark or an interface mock, as a PNG', () => {
    const png = renderArt(logoArt(1))
    expect(bundledImageType(png)).toEqual({ extension: 'png', mimeType: 'image/png' })
  })

  it('returns undefined for an asset that was never bundled', () => {
    expect(loadPhotoAsset('restaurant/not-a-file.jpg')).toBeUndefined()
  })
})
