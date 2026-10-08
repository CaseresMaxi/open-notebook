import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ProfilePage from './page'
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/common/ThemeToggle', () => ({ ThemeToggle: () => null }))
vi.mock('@/components/common/LanguageToggle', () => ({
  LanguageToggle: () => null,
}))
beforeEach(() => window.localStorage.removeItem('study-profile-v1'))
afterEach(() => vi.restoreAllMocks())
describe('browser profile', () => {
  it('saves and restores profile fields after remounting', () => {
    const view = render(<ProfilePage />)
    fireEvent.change(screen.getByLabelText('product.name'), {
      target: { value: 'Ana Pérez' },
    })
    fireEvent.change(screen.getByLabelText('product.email'), {
      target: { value: 'ana@example.com' },
    })
    fireEvent.change(screen.getByLabelText('product.bio'), {
      target: { value: 'Statistics' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'product.saveProfile' }))
    expect(screen.getByRole('status')).toHaveTextContent('product.profileSaved')
    view.unmount()
    render(<ProfilePage />)
    expect(screen.getByLabelText('product.name')).toHaveValue('Ana Pérez')
    expect(screen.getByLabelText('product.email')).toHaveValue(
      'ana@example.com'
    )
    expect(screen.getByLabelText('product.bio')).toHaveValue('Statistics')
  })
  it('recovers from malformed stored profile data', () => {
    window.localStorage.setItem('study-profile-v1', '{broken json')
    render(<ProfilePage />)
    expect(screen.getByLabelText('product.name')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('product.name'), {
      target: { value: 'Recovered' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'product.saveProfile' }))
    expect(screen.getByRole('status')).toHaveTextContent('product.profileSaved')
  })
  it('does not claim success when browser storage fails', () => {
    render(<ProfilePage />)
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable')
    })
    fireEvent.change(screen.getByLabelText('product.name'), {
      target: { value: 'New name' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'product.saveProfile' }))
    expect(screen.getByRole('status')).toHaveTextContent('product.saveFailed')
  })
})
