import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SiteSetting } from '../../src/api/settings-client.js'
import { GeneralTab, SitemapTab } from '../../src/routes/seo.js'

/**
 * `GeneralTab`/`SitemapTab` (fiche 21 task 3), mounted directly — the same
 * isolation `SeoPanel`'s own suite uses (`test/seo/seo-panel.test.tsx`).
 *
 * `SeoRoute`'s own app-level suite (`test/seo.test.tsx`) covers the
 * screen's real behaviour end to end, but the shared admin test fixture
 * (`mock-fetch.ts`'s `MOCK_SCHEMA`) declares no `routing` on any collection
 * — which is itself real (most fixture collections do not route), but
 * leaves the per-collection template/sitemap rows, which only render for a
 * *routed* collection, untested there. Mounting these two tabs directly with
 * a fabricated routed collection, with no shared fixture touched, is what
 * closes that gap.
 */

const COLLECTIONS = [
  { name: 'article', labels: { singular: 'Article' } },
  { name: 'page', labels: { singular: 'Page' } },
]

function siteSetting(key: string, value: unknown): SiteSetting {
  return {
    key,
    group: 'seo',
    order: 0,
    uiType: key.includes('Description') ? 'text' : 'string',
    options: undefined,
    scope: 'site',
    locale: null,
    value,
    isDefault: false,
    updatedAt: null,
    updatedBy: null,
  }
}

describe('GeneralTab', () => {
  it('lists every collection passed in with a title-template field of its own', () => {
    render(
      <GeneralTab
        settings={[
          siteSetting('seo.titleTemplate', ''),
          siteSetting('seo.defaultMetaDescription', ''),
        ]}
        collections={COLLECTIONS}
        templates={{ article: '%title% | Blog' }}
        onSave={() => Promise.resolve()}
      />,
    )

    expect(screen.getByText('Article')).toBeDefined()
    expect(screen.getByText('Page')).toBeDefined()
    expect(screen.getByDisplayValue('%title% | Blog')).toBeDefined()
  })

  it('saves a per-collection template, merged with the templates of every other collection, on blur', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <GeneralTab
        settings={[
          siteSetting('seo.titleTemplate', ''),
          siteSetting('seo.defaultMetaDescription', ''),
        ]}
        collections={COLLECTIONS}
        templates={{ article: '%title% | Blog' }}
        onSave={onSave}
      />,
    )

    const rows = screen.getAllByLabelText('Gabarit de titre')
    const pageField = rows[1]
    if (pageField === undefined) throw new Error('expected a second row')
    fireEvent.blur(pageField, { target: { value: '%title% — Page' } })

    expect(onSave).toHaveBeenCalledWith('seo.collectionTitleTemplates', {
      article: '%title% | Blog',
      page: '%title% — Page',
    })
  })

  it('says so when there is no routed collection to list', () => {
    render(
      <GeneralTab settings={[]} collections={[]} templates={{}} onSave={() => Promise.resolve()} />,
    )

    expect(
      screen.getByText(
        "Aucune collection n'a encore de route publique, donc aucune ne peut être listée ici.",
      ),
    ).toBeDefined()
  })
})

describe('SitemapTab', () => {
  it('shows every collection included by default, with no changefreq/priority hint', () => {
    render(<SitemapTab collections={COLLECTIONS} overrides={{}} onSave={() => Promise.resolve()} />)

    const checkboxes = screen.getAllByLabelText('Dans le sitemap') as HTMLInputElement[]
    expect(checkboxes).toHaveLength(2)
    for (const checkbox of checkboxes) expect(checkbox.checked).toBe(true)
  })

  it('excludes a collection by unchecking it, preserving every other collection’s own override', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SitemapTab
        collections={COLLECTIONS}
        overrides={{ page: { included: true, changefreq: 'weekly', priority: 0.8 } }}
        onSave={onSave}
      />,
    )

    const checkboxes = screen.getAllByLabelText('Dans le sitemap')
    const articleCheckbox = checkboxes[0]
    if (articleCheckbox === undefined) throw new Error('expected a first checkbox')
    fireEvent.click(articleCheckbox)

    expect(onSave).toHaveBeenCalledWith('seo.sitemapCollectionSettings', {
      page: { included: true, changefreq: 'weekly', priority: 0.8 },
      article: { included: false, changefreq: '', priority: '' },
    })
  })

  it('sets a change frequency and a priority for one collection without touching another', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<SitemapTab collections={COLLECTIONS} overrides={{}} onSave={onSave} />)

    const changefreqSelects = screen.getAllByLabelText('Fréquence de changement')
    const articleSelect = changefreqSelects[0]
    if (articleSelect === undefined) throw new Error('expected a first select')
    fireEvent.change(articleSelect, { target: { value: 'weekly' } })
    expect(onSave).toHaveBeenLastCalledWith('seo.sitemapCollectionSettings', {
      article: { included: true, changefreq: 'weekly', priority: '' },
    })

    const priorityInputs = screen.getAllByLabelText('Priorité')
    const pagePriority = priorityInputs[1]
    if (pagePriority === undefined) throw new Error('expected a second priority input')
    fireEvent.blur(pagePriority, { target: { value: '0.5' } })
    expect(onSave).toHaveBeenLastCalledWith('seo.sitemapCollectionSettings', {
      page: { included: true, changefreq: '', priority: 0.5 },
    })
  })

  it('treats an emptied priority as "no hint" rather than NaN', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <SitemapTab
        collections={COLLECTIONS}
        overrides={{ article: { included: true, changefreq: '', priority: 0.5 } }}
        onSave={onSave}
      />,
    )

    const priorityInputs = screen.getAllByLabelText('Priorité')
    const articlePriority = priorityInputs[0]
    if (articlePriority === undefined) throw new Error('expected a first priority input')
    fireEvent.blur(articlePriority, { target: { value: '' } })

    expect(onSave).toHaveBeenCalledWith('seo.sitemapCollectionSettings', {
      article: { included: true, changefreq: '', priority: '' },
    })
  })
})
