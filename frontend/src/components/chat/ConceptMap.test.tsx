import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArcBlock } from './ArcBlock'

const source = JSON.stringify({
  type: 'concept_map',
  title: 'Fotosíntesis',
  nodes: [
    { id: 'f', label: 'Fotosíntesis', detail: 'Convierte luz en energía química.', weight: 5, group: 'Proceso' },
    { id: 'l', label: 'Luz', weight: 2 },
    { id: 'g', label: 'Glucosa', weight: 4, group: 'Producto' },
    { id: 'o', label: 'Oxígeno', weight: 3, group: 'Producto' },
  ],
  links: [
    { source: 'l', target: 'f', label: 'impulsa' },
    { source: 'f', target: 'g', label: 'produce' },
    { source: 'f', target: 'o', label: 'libera' },
  ],
})

describe('ConceptMap', () => {
  it('renders concepts, labelled links and a legend', () => {
    render(<ArcBlock source={source} />)
    expect(screen.getByRole('group', { name: 'Fotosíntesis' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { pressed: false }).filter(item => item.tagName === 'g')).toHaveLength(4)
    expect(screen.getByText('impulsa')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'chat.conceptMapLegend' })).toHaveTextContent('Producto')
  })

  it('focuses a concept with the keyboard and lists its connections', () => {
    render(<ArcBlock source={source} />)
    const concept = screen.getByRole('button', { name: /^Fotosíntesis\./ })
    fireEvent.keyDown(concept, { key: 'Enter' })
    expect(concept).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Convierte luz en energía química.')).toBeInTheDocument()
    // The link label on the map plus the same relation in the detail list.
    expect(screen.getAllByText('produce')).toHaveLength(2)
    fireEvent.keyDown(concept, { key: 'Escape' })
    expect(screen.getByText('chat.conceptMapHint')).toBeInTheDocument()
  })

  it('can show only the key concepts', () => {
    render(<ArcBlock source={source} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.conceptMapKey' }))
    expect(screen.queryByRole('button', { name: /^Luz\./ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Glucosa\./ })).toBeInTheDocument()
  })
})
