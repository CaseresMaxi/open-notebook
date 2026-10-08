import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('./AppSidebar', () => ({ AppSidebar: () => <aside data-testid="sidebar" /> }))
vi.mock('./WorkspaceBackdrop', () => ({ WorkspaceBackdrop: () => <canvas data-testid="backdrop" /> }))

it('preserves one sidebar and backdrop while nested page shells change', () => {
  const { container, rerender } = render(<AppShell><AppShell><p>Notebook</p></AppShell></AppShell>)
  const sidebar = container.querySelector('aside')
  const backdrop = container.querySelector('canvas')
  expect(container.querySelectorAll('main')).toHaveLength(1)
  expect(container.querySelectorAll('aside')).toHaveLength(1)
  rerender(<AppShell><AppShell><p>Profile</p></AppShell></AppShell>)
  expect(container.querySelector('aside')).toBe(sidebar)
  expect(container.querySelector('canvas')).toBe(backdrop)
  expect(container.querySelector('main')).toHaveTextContent('Profile')
})
