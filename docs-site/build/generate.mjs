#!/usr/bin/env node
// Builds the statically published half of L22 task 7's documentation:
// `docs-site/content/**` (plus the one external inclusion, `docs/guide-plugin.md`,
// so a plugin author's guide is never duplicated) rendered to plain HTML under
// `docs-site/dist/`, deployable as-is (GitHub Pages or any static host).
//
// Same source, same renderer as `/admin/documentation`'s in-admin browser
// (`@cogenta/admin`'s `documentation-docs.tsx` imports the identical Markdown
// files via Vite's `?raw` and calls the identical `renderMarkdownToHtml` from
// `@cogenta/render`) — this script only adds the static site's own page
// chrome (sidebar, footer, version banner), never a second copy of the
// content or a second Markdown parser.
//
// Requires `@cogenta/render` and `@cogenta/export` already built
// (`pnpm -F @cogenta/render -F @cogenta/export build`, or `pnpm build`) —
// this script imports their compiled `dist/`, exactly like any other
// consumer of a workspace package (see `packages/cli`'s own `build` script
// for the same convention: copy/import what a sibling package's build
// already produced, never re-implement it).

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const root = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const docsSiteDir = join(root, 'docs-site')
const contentDir = join(docsSiteDir, 'content')
const distDir = join(docsSiteDir, 'dist')

async function importWorkspaceDist(packageDir) {
  const entry = join(root, 'packages', packageDir, 'dist', 'index.js')
  try {
    return await import(pathToFileURL(entry).href)
  } catch (error) {
    throw new Error(
      `Could not import the built "${packageDir}" package (${entry}). ` +
        `Run "pnpm -F @cogenta/${packageDir} build" first — this generator reads compiled output, ` +
        `never TypeScript source, like every other consumer of a workspace package.\n${String(error)}`,
    )
  }
}

const { renderMarkdownDocument } = await importWorkspaceDist('render')
const { createZipWriter } = await importWorkspaceDist('export')

const corePackage = JSON.parse(await readFile(join(root, 'packages/core/package.json'), 'utf8'))
const COGENTA_VERSION = corePackage.version

// ---------------------------------------------------------------------------
// Collect pages.
// ---------------------------------------------------------------------------

/** @typedef {{ tree: 'functional' | 'technical' | null, slug: string, title: string, order: number, html: string, headings: readonly {level:number,text:string,id:string}[] }} Page */

async function readMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && extname(entry.name) === '.md')
    .map((entry) => join(dir, entry.name))
}

/** @returns {Promise<Page>} */
async function loadPage(filePath, tree) {
  const source = await readFile(filePath, 'utf8')
  const doc = renderMarkdownDocument(source)
  const slug = basename(filePath, '.md')
  return {
    tree,
    slug,
    title: doc.meta.title ?? slug,
    order: doc.meta.order === undefined ? 999 : Number(doc.meta.order),
    html: doc.html,
    headings: doc.headings,
  }
}

const pages = []

pages.push(await loadPage(join(contentDir, 'index.md'), null))

for (const tree of /** @type {const} */ (['functional', 'technical'])) {
  const files = await readMarkdownFiles(join(contentDir, tree))
  for (const file of files) {
    pages.push(await loadPage(file, tree))
  }
}

// The plugin guide lives at `docs/guide-plugin.md`, real developer-facing
// documentation that already existed before this lot — included here by
// reference to its one real source file, never copied
// (`docs-site/content/technical/creating-a-plugin.md` deliberately does not exist).
{
  const source = await readFile(join(root, 'docs/guide-plugin.md'), 'utf8')
  const doc = renderMarkdownDocument(source)
  pages.push({
    tree: 'technical',
    slug: 'creating-a-plugin',
    title: 'Creating a plugin',
    order: 4.5, // between "creating-a-theme" (4) and "api-reference" (5)
    html: doc.html,
    headings: doc.headings,
  })
}

const byTree = {
  functional: pages.filter((page) => page.tree === 'functional').sort((a, b) => a.order - b.order),
  technical: pages.filter((page) => page.tree === 'technical').sort((a, b) => a.order - b.order),
}

// ---------------------------------------------------------------------------
// Render the static HTML shell around each page's already-rendered content.
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pageHref(tree, slug) {
  return `${tree}/${slug}.html`
}

function renderSidebar(tree, currentSlug) {
  if (tree === null) return ''
  const items = byTree[tree]
    .map((page) => {
      const href = pageHref(tree, page.slug)
      const current = page.slug === currentSlug
      return `<li><a href="${href}"${current ? ' aria-current="page"' : ''}>${escapeHtml(page.title)}</a></li>`
    })
    .join('\n')
  const otherTree = tree === 'functional' ? 'technical' : 'functional'
  const otherLabel =
    tree === 'functional' ? 'Documentation technique' : 'Documentation fonctionnelle'
  return `
    <nav class="sidebar" aria-label="Sommaire">
      <a class="sidebar__switch" href="../${otherTree}/index.html">${otherLabel} →</a>
      <ul>${items}</ul>
    </nav>`
}

const PAGE_CSS = `
  :root {
    color-scheme: light dark;
    --bg: #ffffff; --fg: #16181d; --muted: #5b6472; --border: #d7dbe2; --accent: #1d4ed8;
    --code-bg: #f2f4f7;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0f1115; --fg: #e7e9ee; --muted: #9aa3b2; --border: #2a2e37; --accent: #7aa2ff; --code-bg: #1a1d24; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
    line-height: 1.65;
  }
  .layout { display: flex; max-width: 72rem; margin: 0 auto; }
  .sidebar { flex: 0 0 16rem; padding: 2rem 1rem; border-right: 1px solid var(--border); }
  .sidebar__switch { display: block; font-size: 0.875rem; margin-bottom: 1rem; color: var(--accent); }
  .sidebar ul { list-style: none; margin: 0; padding: 0; }
  .sidebar a { color: var(--fg); text-decoration: none; }
  .sidebar a[aria-current="page"] { color: var(--accent); font-weight: 600; }
  .sidebar li { margin: 0.25rem 0; }
  main { flex: 1 1 auto; padding: 2rem 2.5rem; min-width: 0; }
  a { color: var(--accent); }
  code { background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 0.25rem; font-size: 0.9em; }
  pre { background: var(--code-bg); padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid var(--border); padding: 0.5rem 0.75rem; text-align: left; }
  blockquote { margin: 1rem 0; padding: 0.5rem 1rem; border-left: 3px solid var(--accent); color: var(--muted); }
  footer.version { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.875rem; }
`

function renderShell({ tree, slug, title, contentHtml }) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Documentation Cogenta</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<div class="layout">
${renderSidebar(tree, slug)}
<main>
${contentHtml}
<footer class="version">Documentation correcte pour Cogenta v${escapeHtml(COGENTA_VERSION)}.</footer>
</main>
</div>
</body>
</html>
`
}

// ---------------------------------------------------------------------------
// Write everything.
// ---------------------------------------------------------------------------

await rm(distDir, { recursive: true, force: true })
await mkdir(join(distDir, 'functional'), { recursive: true })
await mkdir(join(distDir, 'technical'), { recursive: true })
await mkdir(join(distDir, 'downloads'), { recursive: true })

for (const page of pages) {
  const html = renderShell({
    tree: page.tree,
    slug: page.slug,
    title: page.title,
    contentHtml: page.html,
  })
  const outPath =
    page.tree === null ? join(distDir, 'index.html') : join(distDir, page.tree, `${page.slug}.html`)
  await writeFile(outPath, html, 'utf8')
}

// ---------------------------------------------------------------------------
// Downloadable starters, zipped from the real example packages (R9: reuses
// @cogenta/export's zero-dependency ZIP writer rather than adding one).
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo'])

async function collectFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full, relative)))
    } else {
      files.push({ full, relative })
    }
  }
  return files
}

/** `addFile` is awaited in file order — the writer streams sequentially and holds nothing beyond the current entry in memory (see its own header comment in `packages/export/src/zip-writer.ts`). */
async function zipExample(exampleDir, zipName) {
  const sourceDir = join(root, 'examples', exampleDir)
  const chunks = []
  const writer = createZipWriter({ write: (chunk) => void chunks.push(chunk) })
  for (const file of await collectFiles(sourceDir)) {
    await writer.addFile(`${exampleDir}/${file.relative}`, await readFile(file.full))
  }
  await writer.finish()
  await writeFile(join(distDir, 'downloads', zipName), Buffer.concat(chunks))
}

await zipExample('theme-starter', 'theme-starter.zip')
await zipExample('plugin-starter', 'plugin-starter.zip')

process.stdout.write(
  `Generated ${pages.length} page(s) and 2 downloadable starter(s) into ${distDir} (Cogenta v${COGENTA_VERSION}).\n`,
)
