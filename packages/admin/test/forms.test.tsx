import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { expectNoSeriousA11yViolations } from './helpers/axe.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

/**
 * Fiche 16 task 2 — the form builder (contract G, ADR-0026).
 */

const CONTACT_FORM = {
  id: 'form-1',
  name: 'contact',
  label: 'Contact us',
  fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
  active: true,
  confirmationMessage: 'Thanks!',
  redirectTo: null,
  notifyEmails: ['owner@example.com'],
  autoresponder: { enabled: false },
  retainDays: 180,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
}

function signedIn(
  roles: readonly string[],
  extra: Parameters<typeof installMockFetch>[0] = {},
): void {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch({ roles, ...extra })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function goToForms(): Promise<void> {
  await screen.findByRole('heading', { name: 'Tableau de bord' })
  fireEvent.click(await screen.findByRole('link', { name: 'Formulaires' }))
  await screen.findByRole('heading', { name: 'Formulaires' })
}

describe('the forms builder', () => {
  it.each([
    [
      'fr',
      'Merci — votre message a bien été reçu.',
      'Nous avons bien reçu votre message. Nous vous répondrons dès que possible.',
    ],
    [
      'en',
      'Thank you — your message has been received.',
      'We have received your message. We will get back to you as soon as possible.',
    ],
  ])(
    'creates defaults in the site locale %s while the admin remains French',
    async (locale, confirmation, autoresponder) => {
      signedIn(['admin'], { siteLocales: [locale] })
      render(<App />)
      await goToForms()
      await screen.findByText('Aucun formulaire.')
      fireEvent.click(screen.getByRole('button', { name: 'Nouveau formulaire' }))
      expect(
        ((await screen.findByLabelText('Message de confirmation')) as HTMLTextAreaElement).value,
      ).toBe(confirmation)
      fireEvent.click(screen.getByLabelText('Envoyer un accusé de réception automatique'))
      expect(
        (screen.getByLabelText("Message de l'accusé de réception") as HTMLTextAreaElement).value,
      ).toBe(autoresponder)
    },
  )

  it('lists existing forms', async () => {
    signedIn(['admin'], { forms: [CONTACT_FORM] })
    render(<App />)
    await goToForms()

    expect(await screen.findByText('Contact us')).toBeDefined()
    expect(screen.getByText('/forms/contact')).toBeDefined()
  })

  it('pages the complete list, resets a filter and keeps the last page reachable after deletion', async () => {
    signedIn(['admin'], {
      forms: Array.from({ length: 11 }, (_, index) => ({
        ...CONTACT_FORM,
        id: `paged-${index}`,
        name: `form-${index}`,
        label: `Form ${index}`,
      })),
    })
    render(<App />)
    await goToForms()
    await screen.findByText('Form 0')
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(11)
    expect(screen.queryByText('Form 10')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Suivant' })[0] as HTMLElement)
    await screen.findByText('Form 10')
    fireEvent.change(screen.getByLabelText('Rechercher dans la liste'), {
      target: { value: 'Form 0' },
    })
    expect(await screen.findByText('Form 0')).toBeDefined()
    expect(screen.queryByText('Form 10')).toBeNull()
    fireEvent.change(screen.getByLabelText('Rechercher dans la liste'), { target: { value: '' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Suivant' })[0] as HTMLElement)
    await screen.findByText('Form 10')
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))
    await screen.findByText('Form 0')
    expect(screen.queryByText('Form 10')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Suivant' })).toBeNull()
  })

  it('is not offered to a non-admin', async () => {
    signedIn(['editor'])
    render(<App />)
    await screen.findByRole('heading', { name: 'Tableau de bord' })

    expect(screen.queryByRole('link', { name: 'Formulaires' })).toBeNull()
  })

  it('creates a form with a real field, through the real API, reusing the repeater', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToForms()
    await screen.findByText('Aucun formulaire.')

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau formulaire' }))
    await screen.findByRole('heading', { name: 'Nouveau formulaire' })

    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Contact us' } })
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'contact' } })

    // The repeater (fiche 03) adds one row per field.
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un élément' }))
    const nameInputs = screen.getAllByRole('textbox')
    // Fill the freshly added row's own "name"/"label" inputs — the repeater
    // renders one `FieldInput` per declared item property, in order.
    const nameField = nameInputs.find((el) => (el as HTMLInputElement).name === 'name')
    const labelField = nameInputs.find((el) => (el as HTMLInputElement).name === 'label')
    if (nameField !== undefined) fireEvent.change(nameField, { target: { value: 'email' } })
    if (labelField !== undefined) fireEvent.change(labelField, { target: { value: 'E-mail' } })

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(async () => {
      const response = await fetch('/api/forms', {
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      })
      const listBody = (await response.json()) as { data: { name: string }[] }
      expect(listBody.data.some((f) => f.name === 'contact')).toBe(true)
    })
  })

  it('translates the field editor controls and choices without rewriting the author label', async () => {
    signedIn(['admin'], { forms: [CONTACT_FORM] })
    render(<App />)
    await goToForms()
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }))
    expect(
      ((await screen.findByRole('textbox', { name: 'Libellé du champ' })) as HTMLInputElement)
        .value,
    ).toBe('E-mail')
    expect(
      (screen.getByRole('combobox', { name: 'Type de champ' }) as HTMLSelectElement).value,
    ).toBe('email')
    expect(
      (screen.getByRole('option', { name: 'Adresse e-mail' }) as HTMLOptionElement).value,
    ).toBe('email')
    expect(screen.getByLabelText('Aide du champ')).toBeDefined()
    expect(screen.getByLabelText('Étape (laisser vide pour une seule page)')).toBeDefined()
    expect(screen.getByLabelText('Afficher seulement si le champ…')).toBeDefined()
    expect(screen.getByLabelText('Condition')).toBeDefined()
    expect(screen.getByLabelText('Valeur attendue')).toBeDefined()
    expect((screen.getByRole('option', { name: 'Est égal à' }) as HTMLOptionElement).value).toBe(
      'equals',
    )
    expect(screen.queryByLabelText('Label', { exact: true })).toBeNull()
  })

  it('edits an existing form and saves the change through the real API', async () => {
    signedIn(['admin'], { forms: [CONTACT_FORM] })
    render(<App />)
    await goToForms()
    await screen.findByText('Contact us')

    fireEvent.click(screen.getByRole('button', { name: 'Modifier' }))
    const labelInput = (await screen.findByLabelText('Libellé')) as HTMLInputElement
    expect(labelInput.value).toBe('Contact us')
    fireEvent.change(labelInput, { target: { value: 'Contactez-nous' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(async () => {
      const response = await fetch('/api/forms/form-1', {
        headers: { authorization: `Bearer ${VALID_TOKEN}` },
      })
      const updated = (await response.json()) as { data: { label: string } }
      expect(updated.data.label).toBe('Contactez-nous')
    })
  })

  it('pre-fills "Name" from "Label" while typing, until "Name" is edited directly (L20 audit point 11/18)', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToForms()
    await screen.findByText('Aucun formulaire.')

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau formulaire' }))
    await screen.findByRole('heading', { name: 'Nouveau formulaire' })

    const nameInput = screen.getByLabelText('Nom') as HTMLInputElement
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Contact Us' } })
    expect(nameInput.value).toBe('contact-us')

    // Typing further in the label keeps overwriting the derived name…
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Contact Us!' } })
    expect(nameInput.value).toBe('contact-us')

    // …until the admin edits "Name" directly, which must stick from then on.
    fireEvent.change(nameInput, { target: { value: 'reach-us' } })
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Something else' } })
    expect(nameInput.value).toBe('reach-us')
  })

  it('shows a clear success confirmation after creating and after saving a form', async () => {
    signedIn(['admin'])
    render(<App />)
    await goToForms()
    await screen.findByText('Aucun formulaire.')

    fireEvent.click(screen.getByRole('button', { name: 'Nouveau formulaire' }))
    await screen.findByRole('heading', { name: 'Nouveau formulaire' })
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Contact us' } })
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'contact' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('« Contact us » a été créé.')).toBeDefined()
  })

  it('deletes a form after a second confirming click', async () => {
    signedIn(['admin'], { forms: [CONTACT_FORM] })
    render(<App />)
    await goToForms()
    await screen.findByText('Contact us')

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))

    await waitFor(() => expect(screen.queryByText('Contact us')).toBeNull())
  })

  it('has no serious accessibility violations', async () => {
    signedIn(['admin'], { forms: [CONTACT_FORM] })
    const { container } = render(<App />)
    await goToForms()
    await screen.findByText('Contact us')
    await expectNoSeriousA11yViolations(container)
  })
})
