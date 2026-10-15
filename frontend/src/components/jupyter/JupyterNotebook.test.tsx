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

import { usePathname } from 'next/navigation'
import { JupyterNotebook } from './JupyterNotebook'
import { addChatCell, getSession, resetJupyterSessions } from '@/lib/stores/jupyter-session-store'
import { useChatFocusStore } from '@/lib/stores/chat-focus-store'

describe('JupyterNotebook', () => {
  beforeEach(() => {
    run.mockClear(); explainOutput.mockClear(); resetJupyterSessions()
    vi.mocked(usePathname).mockReturnValue('')
    useChatFocusStore.setState({ focus: {}, request: null, draft: null })
  })

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

  it('keeps the session after the notebook closes, so the chat can read it', async () => {
    const { unmount } = render(<JupyterNotebook sourceId="source:1" title="KNN" />)
    fireEvent.click(screen.getByRole('button', { name: 'jupyter.runCell' }))
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument())
    unmount()
    const session = getSession('source:1')
    expect(session.title).toBe('KNN')
    expect(session.live[1]).toEqual([{ type: 'stream', name: 'stdout', text: '42\n' }])
    render(<JupyterNotebook sourceId="source:1" title="KNN" />)
    expect(screen.getByText('42', { selector: 'pre' })).toBeInTheDocument()
  })

  it('shows code added from the chat as a new cell that runs like the others', async () => {
    addChatCell('source:1', 'print(2 * 21)\n')
    render(<JupyterNotebook sourceId="source:1" />)
    expect(screen.getByText('chatFocus.fromChat')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'jupyter.runCell' })
    fireEvent.click(buttons[1])
    await waitFor(() => expect(run).toHaveBeenCalledWith('print(2 * 21)', expect.any(Function)))
    fireEvent.click(screen.getByRole('button', { name: 'jupyter.removeCell' }))
    expect(screen.queryByText('chatFocus.fromChat')).not.toBeInTheDocument()
  })

  it('asks the notebook chat about a cell only inside a notebook', () => {
    render(<JupyterNotebook sourceId="source:1" />)
    expect(screen.queryByRole('button', { name: 'jupyter.askChat' })).not.toBeInTheDocument()
  })

  it('focuses the chat on the notebook with a draft about the cell', () => {
    vi.mocked(usePathname).mockReturnValue('/notebooks/notebook%3Aabc')
    render(<JupyterNotebook sourceId="source:1" />)
    fireEvent.click(screen.getByRole('button', { name: 'jupyter.askChat' }))
    const state = useChatFocusStore.getState()
    expect(state.focus['notebook:abc']).toEqual(['source:1'])
    expect(state.request?.notebookId).toBe('notebook:abc')
    expect(state.takeDraft('notebook:abc')).toBe('jupyter.aboutCell ')
  })
})
