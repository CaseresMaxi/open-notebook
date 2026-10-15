import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CellOutputs, outputsText } from './CellOutputs'
import type { NotebookOutput } from '@/lib/types/jupyter'

const outputs: NotebookOutput[] = [
  { type: 'stream', name: 'stdout', text: 'Tamaño: ' },
  { type: 'stream', name: 'stdout', text: '(10, 3)\n' },
  { type: 'display', data: { 'text/html': '<table class="dataframe"><tr><td>71.6</td></tr></table>', 'text/plain': 'df' } },
  { type: 'display', data: { 'text/html': '<style>.sk{}</style><div class="sk-top-container">widget</div>', 'text/plain': 'KNeighborsClassifier(n_neighbors=11)' } },
  { type: 'display', data: { 'image/png': 'iVBORw0', 'text/plain': '<Figure>' } },
  { type: 'error', ename: 'KeyError', evalue: "'b'", traceback: "KeyError: 'b'" },
]

describe('CellOutputs', () => {
  it('renders streams, tables, estimators, figures and errors like Jupyter', () => {
    render(<CellOutputs outputs={outputs} cellNumber={4} />)
    expect(screen.getByText('Tamaño: (10, 3)')).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveTextContent('71.6')
    expect(screen.getByText('KNeighborsClassifier(n_neighbors=11)')).toBeInTheDocument()
    expect(screen.queryByText('widget')).not.toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute('src', 'data:image/png;base64,iVBORw0')
    expect(screen.getByRole('alert')).toHaveTextContent("KeyError: 'b'")
  })

  it('summarises outputs for the tutor', () => {
    expect(outputsText(outputs)).toBe("Tamaño:\n(10, 3)\ndf\nKNeighborsClassifier(n_neighbors=11)\n[figure]\nKeyError: 'b'")
  })
})
