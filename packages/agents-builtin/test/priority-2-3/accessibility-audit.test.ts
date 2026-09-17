import { describe, expect, it } from 'vitest'
import {
  auditAccessibility,
  auditContrast,
  contrastRatio,
} from '../../src/accessibility/audit.js'

const CONFORMING = `<!doctype html><html lang="fr"><body>
<h1>Les ateliers du samedi</h1>
<h2>S'inscrire</h2>
<img src="/pain.jpg" alt="Des baguettes qui sortent du four">
<img src="/motif.svg" alt="" role="presentation">
<p><a href="/ateliers">Voir tous les ateliers du mois</a></p>
<form><label for="email">Votre e-mail</label><input id="email" type="email"></form>
</body></html>`

describe('auditing the HTML a visitor really receives', () => {
  it('says nothing about a page that is in order', () => {
    expect(auditAccessibility(CONFORMING)).toEqual([])
  })

  it('finds exactly the four defects of a page that has four', () => {
    const page = `<!doctype html><html><body>
<h1>Titre</h1>
<h3>Sous-titre sauté</h3>
<img src="/photo.jpg">
<p><a href="/x">Cliquez ici</a></p>
</body></html>`

    expect(auditAccessibility(page).map((finding) => finding.issue).sort()).toEqual([
      'generic-link-text',
      'heading-skip',
      'image-without-alt',
      'missing-lang',
    ])
  })

  it('accepts a field labelled by aria-label as well as by a <label>', () => {
    const page = `<html lang="en"><body><input type="search" aria-label="Search this site"></body></html>`
    expect(auditAccessibility(page)).toEqual([])
  })

  it('computes a real WCAG ratio, and refuses a pair it cannot parse rather than guessing', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('var(--ink)', '#ffffff')).toBeNull()

    const findings = auditContrast([
      { name: 'body text', foreground: '#767676', background: '#ffffff' },
      { name: 'faint text', foreground: '#bbbbbb', background: '#ffffff' },
      { name: 'large heading', foreground: '#949494', background: '#ffffff', large: true },
    ])

    expect(findings.map((finding) => finding.detail.split(':')[0])).toEqual(['faint text'])
  })
})
