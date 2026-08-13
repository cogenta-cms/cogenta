import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, USER } from './helpers/mock-fetch.js'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function fillAndSubmitPassword(email: string, password: string): Promise<void> {
  await screen.findByRole('heading', { name: 'Connexion à Cogenta' })
  fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
}

describe('password login', () => {
  it('reaches the dashboard with the correct password', async () => {
    installMockFetch()
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'correct horse battery staple')

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
    expect(localStorage.getItem('cogenta.session.token')).toBeTruthy()
  })

  it('shows the server error and stays on the form for a wrong password', async () => {
    installMockFetch()
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'wrong')

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Incorrect email or password.',
    )
    expect(screen.queryByRole('heading', { name: 'Tableau de bord' })).toBeNull()
  })
})

describe('MFA-required login', () => {
  it('asks for a TOTP code, then reaches the dashboard with the right one', async () => {
    installMockFetch({ requireTotp: true })
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'correct horse battery staple')

    expect(await screen.findByRole('heading', { name: 'Code de vérification' })).toBeDefined()

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
  })

  it('reports an incorrect TOTP code without dropping back to the password step', async () => {
    installMockFetch({ requireTotp: true })
    render(<App />)

    await fillAndSubmitPassword(USER.email, 'correct horse battery staple')
    await screen.findByRole('heading', { name: 'Code de vérification' })

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Incorrect verification code.',
    )
    expect(screen.getByRole('heading', { name: 'Code de vérification' })).toBeDefined()
  })
})

describe('session restore', () => {
  it('goes straight to the dashboard with a token the server still honours', async () => {
    installMockFetch()
    localStorage.setItem('cogenta.session.token', 'valid-test-token')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeDefined()
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Connexion à Cogenta' })).toBeNull(),
    )
  })
})
