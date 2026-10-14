import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it } from 'vitest'
import { ArcBlock } from './ArcBlock'

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})

describe('ArcBlock', () => {
  it('renders a sortable table from a block', () => {
    render(<ArcBlock source='{"type":"table","title":"Modelos","columns":["Modelo","Niveles"],"rows":[["CMMI",5],["SPICE",6]]}' />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('CMMI')).toBeInTheDocument()
  })

  it('renders a callout with its tone', () => {
    render(<ArcBlock source='{"type":"callout","tone":"warning","title":"Error frecuente","text":"No confundir QA con QC."}' />)
    expect(screen.getByText('Error frecuente')).toBeInTheDocument()
  })

  it('shows a quiet notice for a broken block', () => {
    render(<ArcBlock source='{"type":"line"}' />)
    expect(screen.getByRole('status')).toHaveTextContent('chat.arcUnavailable')
  })
})
