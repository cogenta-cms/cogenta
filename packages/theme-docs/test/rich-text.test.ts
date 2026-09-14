import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { serializeAll } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { headingAnchors, keyChord, renderDocsRichText, slugify } from '../src/render/rich-text.js'
import { makeContext } from './fixtures.js'

const ctx = makeContext()
type Node = RichTextDocument[number]

let counter = 0
const k = (): string => `k${++counter}`
const span = (text: string, marks: string[] = []) => ({
  _key: k(),
  _type: 'span' as const,
  text,
  marks,
})
const para = (...children: ReturnType<typeof span>[]): Node => ({
  _key: k(),
  _type: 'block',
  style: 'normal',
  children,
  markDefs: [],
})
const bullet = (...children: ReturnType<typeof span>[]): Node => ({
  ...(para(...children) as Extract<Node, { _type: 'block' }>),
  listItem: 'bullet',
  level: 1,
})

function render(document: RichTextDocument): string {
  return serializeAll(renderDocsRichText(ctx, document))
}

describe('code blocks', () => {
  it('turns a paragraph of code into a block with its file name', () => {
    const html = render([
      para(span('relay.yaml', ['code', 'strong']), span('server:\n  port: 8787', ['code'])),
    ])
    expect(html).toBe(
      '<figure class="cd-code" data-labelled="true"><figcaption class="cd-code__label">relay.yaml</figcaption>' +
        '<pre class="cd-code__pre" tabindex="0"><code>server:\n  port: 8787</code></pre></figure>',
    )
  })

  it('renders an unlabelled block without a caption', () => {
    const html = render([para(span('GET /healthz', ['code']))])
    expect(html).toBe(
      '<div class="cd-code"><pre class="cd-code__pre" tabindex="0"><code>GET /healthz</code></pre></div>',
    )
  })

  it('keeps the prompt out of a selection and sets program output apart', () => {
    const html = render([
      para(
        span('Terminal', ['code', 'strong']),
        span('$ relay init\nCreated relay.yaml', ['code']),
      ),
    ])
    expect(html).toContain('<span class="cd-code__prompt" aria-hidden="true">$ </span>relay init')
    expect(html).toContain('<span class="cd-code__output">Created relay.yaml</span>')
  })

  it('sets the continuation of a command as the command, not as output', () => {
    const html = render([
      para(span('$ relay events send \\\n    --data {}\nEvent created', ['code'])),
    ])
    expect(html).toContain('\n    --data {}\n<span class="cd-code__output">Event created</span>')
  })

  it('sets comment lines as comments, a shebang excepted', () => {
    const html = render([para(span('#!/bin/sh\n# retries\n// and in TypeScript', ['code']))])
    expect(html).toContain('#!/bin/sh\n<span class="cd-code__comment"># retries</span>')
    expect(html).toContain('<span class="cd-code__comment">// and in TypeScript</span>')
  })

  it('escapes code, so markup in an example stays text', () => {
    const html = render([para(span('if (a < b && c > d) {}', ['code']))])
    expect(html).toContain('if (a &lt; b &amp;&amp; c &gt; d) {}')
  })

  it('leaves a paragraph that mixes text and code as a paragraph', () => {
    const html = render([para(span('Run '), span('relay dev', ['code']))])
    expect(html).toBe('<p>Run <code>relay dev</code></p>')
  })
})

describe('notes', () => {
  it('turns a blockquote that opens on a bold label into a note', () => {
    const quote: Node = {
      _key: k(),
      _type: 'block',
      style: 'blockquote',
      children: [span('Note:', ['strong']), span(' Events never change.')],
      markDefs: [],
    }
    expect(render([quote])).toBe(
      '<div class="cd-callout" data-kind="note" role="note"><p class="cd-callout__label">Note</p><p class="cd-callout__text">Events never change.</p></div>',
    )
  })

  it('marks warnings apart from notes', () => {
    const quote: Node = {
      _key: k(),
      _type: 'block',
      style: 'blockquote',
      children: [span('caution', ['strong']), span(' Keep secrets out of the file.')],
      markDefs: [],
    }
    expect(render([quote])).toContain(
      'data-kind="warning" role="note"><p class="cd-callout__label">Caution</p>',
    )
  })

  it('leaves any other blockquote a blockquote', () => {
    const quote: Node = {
      _key: k(),
      _type: 'block',
      style: 'blockquote',
      children: [span('Observability is a property.', [])],
      markDefs: [],
    }
    expect(render([quote])).toBe('<blockquote><p>Observability is a property.</p></blockquote>')
  })
})

describe('reference tables', () => {
  it('turns a list of code terms into a definition list, with types when present', () => {
    const html = render([
      bullet(
        span('server.port', ['code']),
        span(' integer, default 8787.', ['em']),
        span(' Port to listen on.'),
      ),
      bullet(span('server.host', ['code']), span(' Interface to bind.')),
    ])
    expect(html).toBe(
      '<dl class="cd-ref" data-columns="3">' +
        '<div class="cd-ref__row"><dt class="cd-ref__term"><code>server.port</code></dt><dd class="cd-ref__meta">integer, default 8787</dd><dd class="cd-ref__desc">Port to listen on.</dd></div>' +
        '<div class="cd-ref__row"><dt class="cd-ref__term"><code>server.host</code></dt><dd class="cd-ref__meta"></dd><dd class="cd-ref__desc">Interface to bind.</dd></div>' +
        '</dl>',
    )
  })

  it('uses two columns when no row names a type', () => {
    expect(render([bullet(span('0', ['code']), span(' Success.'))])).toContain('data-columns="2"')
  })

  it('keeps a list as a list when a single item does not have the shape', () => {
    const html = render([
      bullet(span('relay init', ['code']), span(' Writes the file.')),
      bullet(span('Then start the server.')),
    ])
    expect(html).toContain(
      '<ul><li><code>relay init</code> Writes the file.</li><li>Then start the server.</li></ul>',
    )
    expect(html).not.toContain('cd-ref')
  })
})

describe('keys', () => {
  it('sets a key chord in inline code as keyboard input', () => {
    expect(render([para(span('Press '), span('Ctrl+C', ['code']))])).toContain(
      '<kbd class="cd-kbd"><kbd>Ctrl</kbd>+<kbd>C</kbd></kbd>',
    )
  })

  it('recognises chords and lone named keys, and nothing that merely looks short', () => {
    expect(keyChord('Cmd+Shift+P')).toEqual(['Cmd', 'Shift', 'P'])
    expect(keyChord('Enter')).toEqual(['Enter'])
    expect(keyChord('F5')).toEqual(['F5'])
    expect(keyChord('C')).toBeNull()
    expect(keyChord('a+b')).toBeNull()
    expect(keyChord('relay dev')).toBeNull()
    expect(keyChord('Ctrl+')).toBeNull()
  })

  it('never turns code inside a code block into a key', () => {
    expect(render([para(span('Enter', ['code']))])).toContain('<code>Enter</code>')
  })
})

describe('heading anchors', () => {
  const body: RichTextDocument = [
    { _key: 'h-a', _type: 'block', style: 'h2', children: [span('Examples')], markDefs: [] },
    {
      _key: 'h-b',
      _type: 'block',
      style: 'h3',
      children: [span('Crème brûlée & tea')],
      markDefs: [],
    },
  ]
  const blocks = [
    { _key: 'p1', _type: 'prose', _version: '1.0.0', body },
    { _key: 'p2', _type: 'prose', _version: '1.0.0', body },
  ] as unknown as VocabularyBlock[]

  it('slugs a heading to ASCII', () => {
    expect(slugify('Crème brûlée & tea')).toBe('creme-brulee-tea')
    expect(slugify('***')).toBe('section')
  })

  it('keeps every id unique across the whole page, in reading order', () => {
    const anchors = [...headingAnchors(blocks).values()]
    expect(anchors.map((a) => a.id)).toEqual([
      'examples',
      'creme-brulee-tea',
      'examples-2',
      'creme-brulee-tea-2',
    ])
    expect(anchors.map((a) => a.level)).toEqual([2, 3, 2, 3])
  })

  it('never reuses an id the page itself already carries', () => {
    const main = [
      {
        _key: 'p',
        _type: 'prose',
        _version: '1.0.0',
        body: [
          { _key: 'h', _type: 'block', style: 'h2', children: [span('cg main')], markDefs: [] },
        ],
      },
    ] as unknown as VocabularyBlock[]
    expect([...headingAnchors(main).values()][0]?.id).toBe('cg-main-2')
  })

  it('does not make a heading that holds a link into a link to itself', () => {
    const map = headingAnchors([
      {
        _key: 'p',
        _type: 'prose',
        _version: '1.0.0',
        body: [
          {
            _key: 'h',
            _type: 'block',
            style: 'h2',
            children: [span('See the API', ['m'])],
            markDefs: [{ _key: 'm', _type: 'link', href: '/docs/http-api' }],
          },
        ],
      },
    ] as unknown as VocabularyBlock[])
    const html = serializeAll(
      renderDocsRichText(
        ctx,
        [
          {
            _key: 'h',
            _type: 'block',
            style: 'h2',
            children: [span('See the API', ['m'])],
            markDefs: [{ _key: 'm', _type: 'link', href: '/docs/http-api' }],
          },
        ],
        { anchors: { blockKey: 'p', map } },
      ),
    )
    expect(html).toBe(
      '<h2 id="see-the-api" class="cd-rich__heading"><a href="/en/docs/http-api">See the API</a></h2>',
    )
  })
})
