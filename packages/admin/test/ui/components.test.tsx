import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type JSX, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  cn,
  Field,
  Input,
  Modal,
  Notice,
  Select,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../../src/ui/index.js'
import { expectNoSeriousA11yViolations } from '../helpers/axe.js'

describe('cn', () => {
  it('lets a caller-supplied class win over the component default it conflicts with', () => {
    expect(cn('bg-primary px-4', 'bg-destructive')).toBe('px-4 bg-destructive')
  })

  it('keeps classes that do not conflict with each other', () => {
    expect(cn('rounded-md', 'shadow-card')).toBe('rounded-md shadow-card')
  })
})

describe('Button', () => {
  it('does not submit the form it sits in unless it is asked to', () => {
    const submitted = vi.fn()
    render(
      <form onSubmit={submitted}>
        <Button>Ne pas envoyer</Button>
      </form>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ne pas envoyer' }))
    expect(submitted).not.toHaveBeenCalled()
  })

  it('submits when the caller asks for a submit button', () => {
    const submitted = vi.fn((event: { preventDefault(): void }) => event.preventDefault())
    render(
      <form onSubmit={submitted}>
        <Button type="submit">Envoyer</Button>
      </form>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))
    expect(submitted).toHaveBeenCalledOnce()
  })

  it('refuses clicks while disabled', () => {
    const clicked = vi.fn()
    render(
      <Button disabled onClick={clicked}>
        Indisponible
      </Button>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Indisponible' }))
    expect(clicked).not.toHaveBeenCalled()
  })
})

describe('Field', () => {
  it('names its control through the label, so the label resolves to that control', () => {
    render(<Field label="Adresse e-mail">{(control) => <Input {...control} />}</Field>)
    expect(screen.getByLabelText('Adresse e-mail')).toBe(
      screen.getByRole('textbox', { name: 'Adresse e-mail' }),
    )
  })

  it('announces its error and marks the control invalid', () => {
    render(
      <Field label="Rôle" error="Ce champ est obligatoire.">
        {(control) => <Input {...control} />}
      </Field>,
    )
    const control = screen.getByRole('textbox', { name: 'Rôle' })
    const alert = screen.getByRole('alert')
    expect(control.getAttribute('aria-invalid')).toBe('true')
    expect(alert.textContent).toBe('Ce champ est obligatoire.')
    expect(control.getAttribute('aria-describedby')).toContain(alert.getAttribute('id'))
  })

  it('describes the control with both the description and the error when it has both', () => {
    render(
      <Field label="Mot de passe" description="Au moins 12 caractères." error="Trop court.">
        {(control) => <Input {...control} />}
      </Field>,
    )
    const describedBy =
      screen.getByRole('textbox', { name: 'Mot de passe' }).getAttribute('aria-describedby') ?? ''
    expect(describedBy.split(' ')).toHaveLength(2)
  })

  it('leaves a valid control undescribed and not marked invalid', () => {
    render(<Field label="Nom">{(control) => <Input {...control} />}</Field>)
    const control = screen.getByRole('textbox', { name: 'Nom' })
    expect(control.hasAttribute('aria-invalid')).toBe(false)
    expect(control.hasAttribute('aria-describedby')).toBe(false)
  })
})

function ModalHarness(): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Ouvrir</Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Révoquer la session"
        description="Cette action déconnecte immédiatement l'appareil."
        closeLabel="Fermer"
        footer={<Button onClick={() => setOpen(false)}>Annuler</Button>}
      >
        <p>Contenu de la modale.</p>
      </Modal>
    </>
  )
}

describe('Modal', () => {
  it('is absent until it is opened, then carries its own accessible name', async () => {
    render(<ModalHarness />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
    expect(await screen.findByRole('dialog', { name: 'Révoquer la session' })).toBeTruthy()
  })

  it('closes on Escape and gives focus back to what opened it', async () => {
    render(<ModalHarness />)
    const opener = screen.getByRole('button', { name: 'Ouvrir' })
    // A real pointer click focuses the button it lands on; `fireEvent.click`
    // dispatches the event without doing that. Focusing first is what makes
    // this a test of focus *restoration* rather than of jsdom's event model.
    opener.focus()
    fireEvent.click(opener)
    const dialog = await screen.findByRole('dialog')

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    await waitFor(() => {
      expect(document.activeElement).toBe(opener)
    })
  })

  it('closes from its own close button', async () => {
    render(<ModalHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Fermer' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})

describe('Notice', () => {
  it('announces politely by default', () => {
    render(<Notice>Enregistré.</Notice>)
    expect(screen.getByRole('status').textContent).toContain('Enregistré.')
  })

  it('interrupts when the caller says the news is bad', () => {
    render(
      <Notice tone="danger" live="assertive">
        Impossible d'enregistrer.
      </Notice>,
    )
    expect(screen.getByRole('alert').textContent).toContain("Impossible d'enregistrer.")
  })

  it('stays out of the live region when it was already on screen at load', () => {
    const { container } = render(
      <Notice live="off" title="Recommandation">
        Activez la vérification en deux étapes.
      </Notice>,
    )
    expect(screen.queryByRole('status')).toBeNull()
    expect(container.textContent).toContain('Activez la vérification en deux étapes.')
  })

  it('offers no dismiss control when nothing can be dismissed', () => {
    render(<Notice>Rien à rejeter.</Notice>)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('calls back when its dismiss control is used', () => {
    const dismissed = vi.fn()
    render(
      <Notice onDismiss={dismissed} dismissLabel="Rejeter">
        À rejeter.
      </Notice>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Rejeter' }))
    expect(dismissed).toHaveBeenCalledOnce()
  })
})

describe('the design system as a whole', () => {
  it('has no serious accessibility violation across every component at once', async () => {
    const { container } = render(
      <main>
        <h1>Bibliothèque de composants</h1>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Utilisateurs</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <Notice tone="warning" title="Recommandation" live="off">
              Activez la vérification en deux étapes.
            </Notice>
            <Field label="Adresse e-mail" description="Sert d'identifiant de connexion.">
              {(control) => <Input {...control} type="email" />}
            </Field>
            <Field label="Rôle" error="Choisissez un rôle.">
              {(control) => (
                <Select {...control}>
                  <option value="editor">Éditeur</option>
                  <option value="admin">Administrateur</option>
                </Select>
              )}
            </Field>
            <TableRoot label="Liste des utilisateurs">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Adresse e-mail</TableHeader>
                    <TableHeader>Rôle</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>alice@example.com</TableCell>
                    <TableCell>Éditeur</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableRoot>
            <Button>Créer un utilisateur</Button>
          </CardBody>
        </Card>
      </main>,
    )
    await expectNoSeriousA11yViolations(container)
  })

  it('has no serious accessibility violation with an empty table', async () => {
    const { container } = render(
      <main>
        <h1>Vide</h1>
        <TableRoot label="Liste des utilisateurs">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Adresse e-mail</TableHeader>
                <TableHeader>Rôle</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableEmpty colSpan={2}>Aucun utilisateur.</TableEmpty>
            </TableBody>
          </Table>
        </TableRoot>
      </main>,
    )
    await expectNoSeriousA11yViolations(container)
  })

  it('has no serious accessibility violation inside an open modal', async () => {
    render(
      <Modal
        open
        onOpenChange={() => undefined}
        title="Révoquer la session"
        description="Cette action déconnecte immédiatement l'appareil."
        closeLabel="Fermer"
        footer={<Button variant="destructive">Révoquer</Button>}
      >
        <Field label="Confirmation">{(control) => <Input {...control} />}</Field>
      </Modal>,
    )
    await expectNoSeriousA11yViolations(await screen.findByRole('dialog'))
  })
})
