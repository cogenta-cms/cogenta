import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { builtinPromptTemplateSeeds } from '@cogenta/agents'
import { adminThemeTemplateById } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'

/**
 * The admin translates a built-in prompt's or admin skin's words only while
 * they still equal what the server ships, checked against its English
 * dictionary. If a seed's wording changes and the dictionary does not follow,
 * the admin silently falls back to English — so the two are held equal here,
 * where both packages are in reach.
 */
async function adminDictionary(lang: 'en' | 'fr'): Promise<{
  shippedText: {
    prompts: Record<string, { name: string; description: string }>
    adminThemes: Record<string, { description: string }>
  }
}> {
  const path = join(
    import.meta.dirname,
    '..',
    '..',
    'admin',
    'src',
    'i18n',
    'locales',
    `${lang}.json`,
  )
  return JSON.parse(await readFile(path, 'utf8'))
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
}

describe('the words the admin translates are the words the server ships', () => {
  it('holds every built-in prompt, in English as seeded and in French', async () => {
    const en = await adminDictionary('en')
    const fr = await adminDictionary('fr')
    for (const seed of builtinPromptTemplateSeeds()) {
      const id = slug(seed.name)
      expect(en.shippedText.prompts[id], id).toEqual({
        name: seed.name,
        description: seed.description,
      })
      expect(fr.shippedText.prompts[id]?.description, id).toBeTruthy()
    }
  })

  it('holds every built-in admin skin', async () => {
    const en = await adminDictionary('en')
    for (const id of Object.keys(en.shippedText.adminThemes)) {
      expect(en.shippedText.adminThemes[id]?.description, id).toBe(
        adminThemeTemplateById(id)?.description,
      )
    }
  })
})
