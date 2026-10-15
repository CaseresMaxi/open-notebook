import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotebookDocument, NotebookOutput } from '@/lib/types/jupyter'

const explain = { mutate: vi.fn(), isPending: false, isError: false }
const document: NotebookDocument = {
  language: 'python',
  cells: [
    { index: 0, id: 'a', type: 'markdown', source: '# Exploración', execution_count: null, outputs: [] },
    { index: 1, id: 'b', type: 'code', source: 'print(41 + 1)', execution_count: 7, outputs: [{ type: 'stream', name: 'stdout', text: 'guardado\n' }] },
  ],
  explanations: { 1: 'Suma dos números y **muestra** el total.' },
}
const run = vi.fn(async (_code: string, onOutput: (output: NotebookOutput) => void) => {
  onOutput({ type: 'stream', name: 'stdout', text: '42\n' })
  return true
})
const explainOutput = vi.fn(async () => 'El resultado es **42**.')

vi.mock('@/lib/hooks/use-jupyter', () => ({
  useJupyterNotebook: () => ({ data: document, isPending: false, isError: false }),
  useNotebookExplanations: () => explain,
}))
vi.mock('@/lib/api/jupyter', () => ({ jupyterApi: { explainOutput: (...args: unknown[]) => explainOutput(...(args as [])) } }))
vi.mock('@/lib/python/kernel', () => ({
  PythonKernel: class {
    status = 'idle'
    constructor(private onStatus: (status: string) => void) {}
    start() { this.onStatus('ready') }
    run(code: string, onOutput: (output: NotebookOutput) => void) { return run(code, onOutput) }
    restart() {}
    dispose() {}
  },
}))
vi.mock('@/components/layout/LiquidSurface', () => ({ LiquidSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))

import { JupyterNotebook } from './JupyterNotebook'

describe('JupyterNotebook', () => {
  beforeEach(() => { run.mockClear(); explainOutput.mockClear() })

  it('shows cells, saved outputs and the tutor beside the code', () => {
    render(<JupyterNotebook sourceId="source:1" />)
    expect(screen.getByRole('heading', { name: 'Exploración' })).toBeInTheDocument()
    expect(screen.getByText('guardado')).toBeInTheDocument()
    expect(screen.getByText('jupyter.savedOutput')).toBeInTheDocument()
    expect(screen.getByLabelText('jupyter.tutor')).toHaveTextContent('Suma dos números y muestra el total.')
    expect(explain.mutate).not.toHaveBeenCalled()
  })

  it('runs a cell in the browser kernel and explains the real result', async () => {
    render(<JupyterNotebook sourceId="source:1" />)
    fireEvent.click(screen.getByRole('button', { name: 'jupyter.runCell' }))
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument())
    expect(run).toHaveBeenCalledWith('print(41 + 1)', expect.any(Function))
    expect(screen.queryByText('guardado')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('jupyter.resultExplanation')).toBeInTheDocument())
    expect(explainOutput).toHaveBeenCalledWith('source:1', expect.objectContaining({ code: 'print(41 + 1)', output: '42', context: '# Exploración' }))
    expect(await screen.findByText(/El resultado es/)).toBeInTheDocument()
    expect(screen.getByText('[1]')).toBeInTheDocument()
  })

  it('runs edited code', async () => {
    render(<JupyterNotebook sourceId="source:1" />)
    fireEvent.click(screen.getByRole('button', { name: 'jupyter.edit' }))
    fireEvent.change(screen.getByLabelText('jupyter.codeOf'), { target: { value: 'print(1)' } })
    fireEvent.keyDown(screen.getByLabelText('jupyter.codeOf'), { key: 'Enter', shiftKey: true })
    await waitFor(() => expect(run).toHaveBeenCalledWith('print(1)', expect.any(Function)))
    expect(screen.getByRole('button', { name: /jupyter.resetCell/ })).toBeInTheDocument()
  })
})
