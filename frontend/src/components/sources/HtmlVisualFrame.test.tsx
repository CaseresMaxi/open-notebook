import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatResponseContent } from './ChatResponseContent'
import { HtmlVisualFrame } from './HtmlVisualFrame'
import type { HtmlVisual } from '@/lib/types/api'

const visual: HtmlVisual = { kind: 'html', name: 'Count chart', description: 'A=3 and B=2', html: '<style>@keyframes fade{from{opacity:0}to{opacity:1}}</style><svg><text>A: 3</text></svg>' }

describe('HTML visual artifacts', () => {
  it('isolates code from the app origin and blocks scripts and external resources', () => {
    const { container } = render(<HtmlVisualFrame visual={visual} />)
    const frame = screen.getByTitle('Count chart')
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(frame.getAttribute('srcdoc')).toContain("script-src 'none'")
    expect(frame.getAttribute('srcdoc')).toContain("connect-src 'none'")
    expect(frame.getAttribute('srcdoc')).toContain('prefers-reduced-motion')
    expect(frame.getAttribute('srcdoc')).toContain('<text>A: 3</text>')
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByText('A=3 and B=2')).toBeInTheDocument()
  })

  it('places the chart inside the explanation and supports enlargement', () => {
    render(<ChatResponseContent content={'Before\n\n[[image:1]]\n\nAfter'} images={[visual]} onReferenceClick={vi.fn()} />)
    const frame = screen.getByTitle('Count chart')
    expect(screen.getByText('Before').compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(frame.compareDocumentPosition(screen.getByText('After')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'chat.expandVisual' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getAllByTitle('Count chart')).toHaveLength(2)
  })
})

it('shows inspected source provenance and adaptation changes with the figure', () => {
  const adapted: HtmlVisual = { ...visual, basis: 'adaptation', references: [{ source_id: 'source:tree', source_title: 'Tree.pdf', page: 8, observation: 'Preserved Refund = Yes? and original branch counts.' }], fidelity_notes: ['Responsive layout; original split and counts preserved.'] }
  render(<ChatResponseContent content="[[image:1]]" images={[adapted]} onReferenceClick={vi.fn()} />)
  expect(screen.getByText('chat.sourceAdaptation')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'chat.sourceImage' })).toHaveAttribute('href', '/sources/source%3Atree')
  expect(screen.getByText('chat.visualChanges')).toBeInTheDocument()
  expect(screen.getByText('Responsive layout; original split and counts preserved.')).toBeInTheDocument()
})
