#!/usr/bin/env node
/**
 * Downloads the web fonts the ten built-in themes use and writes them next to
 * the theme, so a site served by `cogenta serve` never asks Google for a font.
 *
 *   node scripts/fetch-theme-fonts.mjs [theme ...]
 *
 * For each theme this writes, inside `packages/theme-<name>/`:
 *
 *   fonts/<family>-<style>-<subset>-<hash>.woff2   Latin and Latin Extended only
 *   fonts/OFL-<family>.txt                          the licence, verbatim
 *   fonts/manifest.json                             the faces `cogenta serve` serves
 *   fonts/README.md                                 families, licence, source, how fetched
 *   src/styles/fonts.css                            the `@font-face` rules
 *
 * The families, axes and weights are exactly the ones the theme asked Google
 * for before (the `REQUESTS` table below is that old `@import`, kept as data),
 * so the typography does not change. The `css2` API is asked with a modern
 * User-Agent so it answers with variable WOFF2 files, one per `unicode-range`
 * subset; only `latin` and `latin-ext` are kept (French needs œ Œ ’ « » and
 * the euro sign, all of which `latin` covers).
 *
 * File names carry a hash of the bytes. A theme update that changes a file
 * therefore changes its URL, which is what lets `cogenta serve` send
 * `immutable` cache headers without ever serving a stale face.
 *
 * Network access is only needed to run this script, never to build, test or
 * serve a site. The output is committed.
 */
import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const KEPT_SUBSETS = new Set(['latin', 'latin-ext'])

/** google/fonts directory holding the licence of each family. */
const LICENCE_DIRS = {
  'Albert Sans': 'albertsans',
  Archivo: 'archivo',
  'Bricolage Grotesque': 'bricolagegrotesque',
  'Cormorant Garamond': 'cormorantgaramond',
  Figtree: 'figtree',
  Fraunces: 'fraunces',
  Geist: 'geist',
  'Geist Mono': 'geistmono',
  'IBM Plex Mono': 'ibmplexmono',
  'IBM Plex Sans': 'ibmplexsans',
  'Instrument Sans': 'instrumentsans',
  'Instrument Serif': 'instrumentserif',
  Karla: 'karla',
  'Libre Franklin': 'librefranklin',
  Literata: 'literata',
  'Source Sans 3': 'sourcesans3',
  'Source Serif 4': 'sourceserif4',
}

const REQUESTS = {
  association: [
    'family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800',
    'family=Source+Sans+3:ital,wght@0,200..900;1,200..900',
  ],
  blog: [
    'family=Figtree:wght@400..700',
    'family=Literata:ital,opsz,wght@0,7..72,300..700;1,7..72,300..600',
  ],
  canonical: [
    'family=Instrument+Sans:ital,wght@0,400..700;1,400..700',
    'family=Instrument+Serif:ital@0;1',
  ],
  docs: [
    'family=IBM+Plex+Sans:ital,wght@0,100..700;1,100..700',
    'family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;1,400',
  ],
  ecommerce: ['family=Albert+Sans:ital,wght@0,100..900;1,100..900'],
  entreprise: ['family=Geist:wght@300..700', 'family=Geist+Mono:wght@400..600'],
  magazine: [
    'family=Fraunces:opsz,wght@9..144,300..800',
    'family=Libre+Franklin:wght@400..800',
    'family=Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400..600',
  ],
  portfolio: ['family=Archivo:wdth,wght@62..125,100..900'],
  restaurant: [
    'family=Cormorant+Garamond:ital,wght@0,300..700;1,300..700',
    'family=Karla:ital,wght@0,200..800;1,200..800',
  ],
  saas: ['family=Geist:wght@100..900', 'family=Geist+Mono:wght@100..900'],
}

const slug = (family) => family.toLowerCase().replaceAll(' ', '-')

async function get(url, headers = {}) {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return response
}

/** `@font-face` blocks of a Google css2 answer, each with the subset named by the comment above it. */
function parseFaces(css) {
  const faces = []
  for (const match of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    const body = match[2]
    const field = (name) => new RegExp(`${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim()
    const src = /url\(([^)]+)\)/.exec(body)?.[1]
    faces.push({
      subset: match[1],
      family: field('font-family')?.replace(/['"]/g, ''),
      style: field('font-style'),
      weight: field('font-weight'),
      stretch: field('font-stretch'),
      range: field('unicode-range'),
      src,
    })
  }
  return faces
}

async function licenceFor(family) {
  const dir = LICENCE_DIRS[family]
  if (dir === undefined) throw new Error(`no licence directory known for ${family}`)
  const base = `https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}`
  const text = await (await get(`${base}/OFL.txt`)).text()
  if (!/SIL OPEN FONT LICENSE/i.test(text)) throw new Error(`${family}: OFL.txt is not the OFL`)
  const meta = await (await get(`${base}/METADATA.pb`)).text()
  if (!/license:\s*"OFL"/.test(meta)) throw new Error(`${family}: METADATA.pb does not say OFL`)
  return text
}

async function buildTheme(theme) {
  const themeDir = join(ROOT, 'packages', `theme-${theme}`)
  const fontsDir = join(themeDir, 'fonts')
  await rm(fontsDir, { recursive: true, force: true })
  await mkdir(fontsDir, { recursive: true })

  const rules = []
  const rows = []
  const licences = new Map()

  for (const request of REQUESTS[theme]) {
    const css = await (
      await get(`https://fonts.googleapis.com/css2?${request}&display=swap`, {
        'User-Agent': USER_AGENT,
      })
    ).text()
    for (const face of parseFaces(css)) {
      if (!KEPT_SUBSETS.has(face.subset)) continue
      const bytes = Buffer.from(await (await get(face.src)).arrayBuffer())
      if (bytes.subarray(0, 4).toString('latin1') !== 'wOF2') {
        throw new Error(`${face.src} is not a WOFF2 file`)
      }
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8)
      const file = `${slug(face.family)}-${face.style}-${face.subset}-${hash}.woff2`
      await writeFile(join(fontsDir, file), bytes)
      const lines = [
        `  font-family: '${face.family}';`,
        `  font-style: ${face.style};`,
        `  font-weight: ${face.weight};`,
      ]
      if (face.stretch !== undefined) lines.push(`  font-stretch: ${face.stretch};`)
      lines.push(
        '  font-display: swap;',
        `  src: url(/_cogenta/fonts/${theme}/${file}) format('woff2');`,
        `  unicode-range: ${face.range};`,
      )
      const rule = `@font-face {\n${lines.join('\n')}\n}`
      rules.push(rule)
      rows.push({ ...face, file, size: bytes.length, rule })
      if (!licences.has(face.family)) licences.set(face.family, await licenceFor(face.family))
    }
  }

  const reserved = []
  for (const [family, text] of licences) {
    await writeFile(join(fontsDir, `OFL-${slug(family)}.txt`), text)
    const name = /with Reserved Font Name\s+["'“]([^"'”]+)["'”]/i.exec(text)?.[1]
    if (name !== undefined) reserved.push({ family, name })
  }

  const cssHead = `/*
 * The web fonts of \`@cogenta/theme-${theme}\`, served by the site itself.
 *
 * GENERATED by \`scripts/fetch-theme-fonts.mjs\` — edit that script, not this
 * file. The faces live in this package's \`fonts/\` directory and are sent by
 * \`cogenta serve\` at \`/_cogenta/fonts/${theme}/<file>\`; no request leaves the
 * site, so a visitor's address is never handed to a font provider. See
 * \`fonts/README.md\` for the families, their licence and their source.
 *
 * \`font-display: swap\` keeps text visible in a system face while a file loads,
 * and \`unicode-range\` splits Latin from Latin Extended so a French page
 * downloads only the first.
 */
`
  await writeFile(
    join(themeDir, 'src', 'styles', 'fonts.css'),
    `${cssHead}\n${rules.join('\n\n')}\n`,
  )

  await writeFile(
    join(fontsDir, 'manifest.json'),
    `${JSON.stringify(
      {
        theme,
        faces: rows.map((row) => ({
          family: row.family,
          style: row.style,
          weight: row.weight,
          subset: row.subset,
          file: row.file,
          css: row.rule,
        })),
      },
      null,
      2,
    )}\n`,
  )

  const total = rows.reduce((sum, row) => sum + row.size, 0)
  const families = [...licences.keys()]
  const readme = `# Fonts of \`@cogenta/theme-${theme}\`

Served by the site itself at \`/_cogenta/fonts/${theme}/<file>\`. A page of this
theme makes **no request to a font provider**.

| Family | Style | Subset | Weight | File | Size |
|---|---|---|---|---|---|
${rows
  .map(
    (row) =>
      `| ${row.family} | ${row.style} | ${row.subset} | ${row.weight}${row.stretch === undefined ? '' : ` (width ${row.stretch})`} | \`${row.file}\` | ${(row.size / 1024).toFixed(1)} KiB |`,
  )
  .join('\n')}

Total: ${rows.length} files, ${(total / 1024).toFixed(1)} KiB.

## Licence

${families.map((family) => `- **${family}**: SIL Open Font License 1.1, text in \`OFL-${slug(family)}.txt\``).join('\n')}

The OFL permits bundling and redistributing these files with this package, as
long as the licence text travels with them (it does) and the fonts are not sold
on their own.
${
  reserved.length === 0
    ? ''
    : `
**Reserved Font Names.** ${reserved.map((entry) => `${entry.family} declares "${entry.name}"`).join('; ')}. The
files are subsets of the upstream fonts, as the Google Fonts
\`css2\` API serves them under the family's own name (the same files every web-font
distribution of these families ships); no outline was redrawn and nothing was renamed. A strict
reading of OFL 1.1 section 3 may treat a subset as a Modified Version, so a
legal review of this point belongs to the maintainers.
`
}
## Source and subsets

The files are the variable WOFF2 builds that the Google Fonts \`css2\` API
serves, taken from the \`google/fonts\` open-source repository's distribution.
Only the \`latin\` and \`latin-ext\` subsets are kept: together they cover
French (œ Œ ’ « » and every accented capital), the other Western European
languages, and the euro sign. A language written in another script falls back to
the next family of the theme's stack.

## How they were fetched

\`\`\`sh
node scripts/fetch-theme-fonts.mjs ${theme}
\`\`\`

The script asks \`https://fonts.googleapis.com/css2\` with a modern User-Agent for
exactly the families, axes and weights this theme used before it was
self-hosted, downloads each \`latin\`/\`latin-ext\` file, names it after a hash of
its bytes (so a changed file gets a new URL and can be cached for a year), and
rewrites \`src/styles/fonts.css\`. It needs the network once, when it is run, and
never when a site is built, tested or served.
`
  await writeFile(join(fontsDir, 'README.md'), readme)
  return { theme, files: rows.length, bytes: total, families }
}

const requested = process.argv.slice(2)
const themes = requested.length > 0 ? requested : Object.keys(REQUESTS)
for (const theme of themes) {
  if (REQUESTS[theme] === undefined) throw new Error(`unknown theme ${theme}`)
  const result = await buildTheme(theme)
  process.stdout.write(
    `${theme}: ${result.files} files, ${(result.bytes / 1024).toFixed(0)} KiB (${result.families.join(', ')})\n`,
  )
}
