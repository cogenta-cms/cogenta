// Keeps the Helm chart's appVersion equal to the CLI version, so the chart in
// git at a release tag always points at the image built from that tag.
// Runs after `changeset version` (see the `version-packages` script).
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const { version } = JSON.parse(readFileSync(new URL('packages/cli/package.json', root), 'utf8'))
const chartUrl = new URL('charts/cogenta/Chart.yaml', root)
const chart = readFileSync(chartUrl, 'utf8')
const next = chart.replace(/^appVersion: .*$/m, `appVersion: "${version}"`)
if (next !== chart) writeFileSync(chartUrl, next)
