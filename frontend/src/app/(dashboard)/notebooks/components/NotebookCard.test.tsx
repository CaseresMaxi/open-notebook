import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotebookCard, notebookAccent } from './NotebookCard'

vi.mock('@/lib/hooks/use-notebooks', () => ({ useUpdateNotebook: () => ({ mutate: vi.fn() }) }))
vi.mock('./NotebookDeleteDialog', () => ({ NotebookDeleteDialog: () => null }))

const notebook = {
  id: 'notebook:abc', name: 'ciencia de datos', description: 'Apuntes', archived: false,
  created: '2026-09-01T00:00:00Z', updated: new Date(Date.now() - 3_600_000).toISOString(),
  source_count: 16, note_count: 2,
}

describe('NotebookCard', () => {
  it('gives each notebook a stable accent from theme hues', () => {
    expect(notebookAccent('notebook:abc')).toBe(notebookAccent('notebook:abc'))
    expect(notebookAccent('notebook:abc')).toMatch(/^var\(--(teal|fern|violet|clay|type-[a-z]+)\)$/)
  })

  it('shows monogram, title link, counts and relative update time', () => {
    render(<NotebookCard notebook={notebook} />)
    expect(screen.getByRole('link', { name: 'ciencia de datos' })).toHaveAttribute('href', '/notebooks/notebook%3Aabc')
    expect(screen.getByText('C')).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Apuntes')).toBeInTheDocument()
    expect(document.querySelector('time')).toHaveAttribute('dateTime', notebook.updated)
  })
})
