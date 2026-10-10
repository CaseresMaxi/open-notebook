import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(), finish: vi.fn(), create: vi.fn(), verify: vi.fn(), profile: vi.fn(),
  login: vi.fn(), reset: vi.fn(), logout: vi.fn(),
  user: { emailVerified: false, reload: vi.fn(), getIdToken: vi.fn() },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/lib/firebase', () => ({ accountAuth: async () => ({ currentUser: mocks.user }) }))
vi.mock('@/lib/stores/auth-store', () => ({ useAuthStore: () => ({ firebaseConfig: { projectId: 'test' }, finishAccountLogin: mocks.finish }) }))
vi.mock('@/lib/hooks/use-translation', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/layout/LiquidSurface', () => ({ LiquidSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: mocks.create, sendEmailVerification: mocks.verify,
  updateProfile: mocks.profile, signInWithEmailAndPassword: mocks.login,
  sendPasswordResetEmail: mocks.reset, signOut: mocks.logout,
  GoogleAuthProvider: class {}, signInWithPopup: vi.fn(),
}))
import { AccountForm } from './AccountForm'

function fillSignup() {
  fireEvent.change(screen.getByLabelText('product.name'), { target: { value: 'Student' } })
  fireEvent.change(screen.getByLabelText('product.email'), { target: { value: 'student@example.com' } })
  fireEvent.change(screen.getByLabelText('auth.passwordPlaceholder'), { target: { value: 'password123' } })
  fireEvent.change(screen.getByLabelText('account.confirmPassword'), { target: { value: 'password123' } })
}

describe('Account form', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user.emailVerified = false
    mocks.user.reload.mockResolvedValue(undefined)
    mocks.user.getIdToken.mockResolvedValue('fresh-token')
    mocks.create.mockResolvedValue({ user: mocks.user })
    mocks.finish.mockResolvedValue({ admin: true })
    sessionStorage.clear()
  })
  it('creates the identity and waits for verification before creating a session', async () => {
    render(<AccountForm register />)
    fillSignup()
    fireEvent.click(screen.getByRole('button', { name: 'account.createAccount' }))
    await screen.findByRole('button', { name: 'account.checkVerification' })
    expect(mocks.profile).toHaveBeenCalledWith(mocks.user, { displayName: 'Student' })
    expect(mocks.verify).toHaveBeenCalledWith(mocks.user)
    expect(mocks.finish).not.toHaveBeenCalled()
    mocks.user.emailVerified = true
    fireEvent.click(screen.getByRole('button', { name: 'account.checkVerification' }))
    await waitFor(() => expect(mocks.finish).toHaveBeenCalledWith('fresh-token'))
    expect(mocks.replace).toHaveBeenCalledWith('/notebooks')
  })
  it('does not create an account when passwords differ', async () => {
    render(<AccountForm register />)
    fillSignup()
    fireEvent.change(screen.getByLabelText('account.confirmPassword'), { target: { value: 'different123' } })
    fireEvent.click(screen.getByRole('button', { name: 'account.createAccount' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('account.passwordMismatch')
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('never follows a foreign post-login redirect', async () => {
    mocks.user.emailVerified = true
    sessionStorage.setItem('redirectAfterLogin', '//attacker.example')
    render(<AccountForm />)
    fireEvent.change(screen.getByLabelText('product.email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('auth.passwordPlaceholder'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'auth.signIn' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/notebooks'))
  })
  it('sends a reset request and confirms it inline', async () => {
    render(<AccountForm />)
    fireEvent.click(screen.getByRole('button', { name: 'account.forgotPassword' }))
    fireEvent.change(screen.getByLabelText('product.email'), { target: { value: 'student@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'account.sendReset' }))
    expect(await screen.findByRole('status')).toHaveTextContent('account.resetSent')
    expect(mocks.reset).toHaveBeenCalledWith(expect.anything(), 'student@example.com')
  })
})
