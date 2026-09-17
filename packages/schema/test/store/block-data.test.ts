import { describe, expect, it } from 'vitest'
import { pruneEmptyBlockData } from '../../src/store/block-data.js'

describe('the empty values a form leaves in a block', () => {
  it('drops cleared media, links, texts and structured values, as contract B means "absent"', () => {
    expect(
      pruneEmptyBlockData({
        title: 'Titre',
        subtitle: '',
        media: null,
        sort: {},
        limit: null,
        attribution: { name: 'Hélène', role: '', avatar: null },
      }),
    ).toEqual({ title: 'Titre', attribution: { name: 'Hélène' } })
  })

  it('cleans inside list items but keeps every item in place', () => {
    expect(
      pruneEmptyBlockData({
        items: [
          { _key: 'a', icon: '', title: 'A', link: null },
          { _key: 'b', title: '' },
        ],
        actions: [],
      }),
    ).toEqual({ items: [{ _key: 'a', title: 'A' }, { _key: 'b' }], actions: [] })
  })

  it('never touches a rich-text node, whose empty text is meaningful', () => {
    const body = [
      {
        _key: 'p',
        _type: 'block',
        style: 'normal',
        markDefs: [],
        children: [{ _key: 's', _type: 'span', text: '', marks: [] }],
      },
    ]
    expect(pruneEmptyBlockData({ body })).toEqual({ body })
  })
})
