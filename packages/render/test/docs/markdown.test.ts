import { describe, expect, it } from 'vitest'
import {
  adaptDocHtmlForAdmin,
  parseFrontmatter,
  renderMarkdownDocument,
  renderMarkdownToHtml,
} from '../../src/docs/markdown.js'

describe('parseFrontmatter', () => {
  it('reads key: value pairs between two --- lines', () => {
    const { meta, body } = parseFrontmatter('---\ntitle: Créer un thème\norder: 3\n---\nHello.')
    expect(meta).toEqual({ title: 'Créer un thème', order: '3' })
    expect(body).toBe('Hello.')
  })

  it('returns the whole source as the body when there is no frontmatter block', () => {
    const { meta, body } = parseFrontmatter('# Just a heading\n')
    expect(meta).toEqual({})
    expect(body).toBe('# Just a heading\n')
  })

  it('tolerates a colon inside a value', () => {
    const { meta } = parseFrontmatter('---\ntitle: Ratio 16:9\n---\nbody')
    expect(meta.title).toBe('Ratio 16:9')
  })
})

describe('renderMarkdownToHtml — headings', () => {
  it('renders h1 through h6 with a stable, unique slug id', () => {
    const { html, headings } = renderMarkdownToHtml('# Title\n\n## Sub Section\n\n## Sub Section')
    expect(html).toContain('<h1 id="title">Title</h1>')
    expect(html).toContain('<h2 id="sub-section">Sub Section</h2>')
    // A repeated heading text gets a disambiguated id rather than colliding.
    expect(html).toContain('<h2 id="sub-section-1">Sub Section</h2>')
    expect(headings).toEqual([
      { level: 1, text: 'Title', id: 'title' },
      { level: 2, text: 'Sub Section', id: 'sub-section' },
      { level: 2, text: 'Sub Section', id: 'sub-section-1' },
    ])
  })

  it('strips accents from a heading id but keeps the visible accented text', () => {
    const { html } = renderMarkdownToHtml('## Créer un thème')
    expect(html).toContain('id="creer-un-theme"')
    expect(html).toContain('>Créer un thème<')
  })
})

describe('renderMarkdownToHtml — paragraphs and inline marks', () => {
  it('wraps a run of non-blank lines in one paragraph', () => {
    const { html } = renderMarkdownToHtml('Line one\nline two.\n\nSecond paragraph.')
    expect(html).toBe('<p>Line one line two.</p>\n<p>Second paragraph.</p>')
  })

  it('renders bold, italic and inline code', () => {
    const { html } = renderMarkdownToHtml('**bold** and _em_ and `code()`')
    expect(html).toBe('<p><strong>bold</strong> and <em>em</em> and <code>code()</code></p>')
  })

  it('renders a link and marks an external one for a safe target', () => {
    const { html } = renderMarkdownToHtml('[Cogenta](https://cogenta.dev)')
    expect(html).toBe('<p><a href="https://cogenta.dev" rel="noopener noreferrer">Cogenta</a></p>')
  })

  it('renders a relative link without rel="noopener"', () => {
    const { html } = renderMarkdownToHtml('[Suivant](../technical/architecture.html)')
    expect(html).toBe('<p><a href="../technical/architecture.html">Suivant</a></p>')
  })

  it('renders an image', () => {
    const { html } = renderMarkdownToHtml('![A screenshot](./shot.png)')
    expect(html).toBe('<p><img src="./shot.png" alt="A screenshot" loading="lazy"></p>')
  })
})

describe('renderMarkdownToHtml — lists', () => {
  it('renders a flat bullet list', () => {
    const { html } = renderMarkdownToHtml('- one\n- two\n- three')
    expect(html).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>')
  })

  it('renders an ordered list', () => {
    const { html } = renderMarkdownToHtml('1. first\n2. second')
    expect(html).toBe('<ol><li>first</li><li>second</li></ol>')
  })

  it('nests a two-space-indented list inside its parent item', () => {
    const { html } = renderMarkdownToHtml('- parent\n  - child one\n  - child two\n- sibling')
    expect(html).toBe(
      '<ul><li>parent<ul><li>child one</li><li>child two</li></ul></li><li>sibling</li></ul>',
    )
  })
})

describe('renderMarkdownToHtml — code fences, quotes, rules, tables', () => {
  it('renders a fenced code block with a language class and escapes its content literally', () => {
    const { html } = renderMarkdownToHtml('```ts\nconst x = 1 < 2\n```')
    expect(html).toBe('<pre><code class="language-ts">const x = 1 &lt; 2</code></pre>')
  })

  it('never interprets Markdown syntax inside a fenced code block', () => {
    const { html } = renderMarkdownToHtml('```\n**not bold** [not a link](x)\n```')
    expect(html).toContain('**not bold** [not a link](x)')
    expect(html).not.toContain('<strong>')
  })

  it('renders a blockquote', () => {
    const { html } = renderMarkdownToHtml('> A quoted line')
    expect(html).toBe('<blockquote><p>A quoted line</p></blockquote>')
  })

  it('renders a horizontal rule', () => {
    const { html } = renderMarkdownToHtml('above\n\n---\n\nbelow')
    expect(html).toBe('<p>above</p>\n<hr>\n<p>below</p>')
  })

  it('renders a pipe table', () => {
    const { html } = renderMarkdownToHtml(
      '| Contrat | Version |\n| --- | --- |\n| A | 2.1 |\n| B | 1.0 |',
    )
    expect(html).toBe(
      '<table><thead><tr><th>Contrat</th><th>Version</th></tr></thead>' +
        '<tbody><tr><td>A</td><td>2.1</td></tr><tr><td>B</td><td>1.0</td></tr></tbody></table>',
    )
  })
})

describe('renderMarkdownToHtml — safety', () => {
  it('escapes a literal HTML tag in prose instead of letting it through', () => {
    const { html } = renderMarkdownToHtml('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes an angle bracket inside an inline code span', () => {
    const { html } = renderMarkdownToHtml('`a < b`')
    expect(html).toBe('<p><code>a &lt; b</code></p>')
  })

  it('escapes a quote inside a link href so it cannot close the attribute early', () => {
    const { html } = renderMarkdownToHtml('[x](foo"onmouseover="bar)')
    expect(html).toBe('<p><a href="foo&quot;onmouseover=&quot;bar">x</a></p>')
  })
})

describe('adaptDocHtmlForAdmin', () => {
  it('rewrites a same-tree relative page link into an admin doc route', () => {
    const out = adaptDocHtmlForAdmin(
      '<a href="personnaliser-lapparence.html#seo">SEO</a>',
      'functional',
    )
    expect(out).toBe(
      '<a href="/admin/documentation/docs/functional/personnaliser-lapparence#seo">SEO</a>',
    )
  })

  it('rewrites a cross-tree relative page link regardless of the current tree', () => {
    const out = adaptDocHtmlForAdmin(
      '<a href="../technical/creer-un-theme.html">Créer un thème</a>',
      'functional',
    )
    expect(out).toBe(
      '<a href="/admin/documentation/docs/technical/creer-un-theme">Créer un thème</a>',
    )
  })

  it('rewrites a root-level tree-prefixed link with no leading ../', () => {
    const out = adaptDocHtmlForAdmin(
      '<a href="functional/index.html">Fonctionnelle</a>',
      'functional',
    )
    expect(out).toBe('<a href="/admin/documentation/docs/functional/index">Fonctionnelle</a>')
  })

  it('rewrites a known download link to its real GitHub source directory', () => {
    const out = adaptDocHtmlForAdmin(
      '<a href="../downloads/theme-starter.zip">Télécharger</a>',
      'technical',
    )
    expect(out).toBe(
      '<a href="https://github.com/cogenta-cms/cogenta/tree/main/examples/theme-starter" rel="noopener noreferrer" target="_blank">Télécharger</a>',
    )
  })

  it('leaves an external link untouched', () => {
    const out = adaptDocHtmlForAdmin('<a href="https://cogenta.dev">Site</a>', 'technical')
    expect(out).toBe('<a href="https://cogenta.dev">Site</a>')
  })

  it('leaves a pure in-page anchor untouched', () => {
    const out = adaptDocHtmlForAdmin('<a href="#seo">Aller à SEO</a>', 'functional')
    expect(out).toBe('<a href="#seo">Aller à SEO</a>')
  })
})

describe('renderMarkdownDocument', () => {
  it('combines frontmatter and rendering in one call', () => {
    const doc = renderMarkdownDocument(
      '---\ntitle: Créer un plugin\n---\n# Créer un plugin\n\nBody.',
    )
    expect(doc.meta.title).toBe('Créer un plugin')
    expect(doc.html).toContain('<h1 id="creer-un-plugin">Créer un plugin</h1>')
    expect(doc.html).toContain('<p>Body.</p>')
    expect(doc.headings).toEqual([{ level: 1, text: 'Créer un plugin', id: 'creer-un-plugin' }])
  })
})
