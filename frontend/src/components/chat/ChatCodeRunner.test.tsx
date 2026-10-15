import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotebookOutput } from '@/lib/types/jupyter'

const run = vi.fn(async (_code: string, onOutput: (output: NotebookOutput) => void) => {
  onOutput({ type: 'stream', name: 'stdout', text: '(100, 5)\n' })
  return true
})
const created: string[] = []
vi.mock('@/lib/python/kernel', () => ({
  PythonKernel: class {
    status = 'idle'
    constructor(private onStatus: (status: string) => void) { created.push('kernel') }
    start() { this.onStatus('ready') }
    run(code: string, onOutput: (output: NotebookOutput) => void) { return run(code, onOutput) }
    restart() {}
    dispose() {}
  },
}))

import { MarkdownRenderer, CodeBlockExtrasContext } from '@/components/ui/markdown-renderer'
import { ChatCodeRunner, RUNNABLE_LANGUAGES } from './ChatCodeRunner'
import { getSession, resetJupyterSessions } from '@/lib/stores/jupyter-session-store'

function Answer({ notebook }: { notebook?: { id: string; title: string } }) {
  return (
    <CodeBlockExtrasContext.Provider value={(code, language) => RUNNABLE_LANGUAGES.has(language)
      ? <ChatCodeRunner code={code} sessionKey="chat:nb" notebook={notebook} /> : null}>
      <MarkdownRenderer>{'Mirá:\n\n```python\nprint(df.shape)\n```\n\n```bash\nls\n```'}</MarkdownRenderer>
    </CodeBlockExtrasContext.Provider>
  )
}

describe('ChatCodeRunner', () => {
  beforeEach(() => { run.mockClear(); resetJupyterSessions() })

  it('runs a Python block from an answer and shows its output below it', async () => {
    render(<Answer />)
    expect(screen.getAllByRole('button', { name: 'chatCode.run' })).toHaveLength(1)
    expect(screen.queryByText('chatFocus.addToNotebook')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chatCode.run' }))
    await waitFor(() => expect(screen.getByText('(100, 5)')).toBeInTheDocument())
    expect(run).toHaveBeenCalledWith('print(df.shape)', expect.any(Function))
    expect(screen.getByRole('button', { name: 'chatCode.runAgain' })).toBeInTheDocument()
    expect(getSession('chat:nb').status).toBe('ready')
  })

  it('runs in the focused notebook session and can add the block to it', async () => {
    render(<Answer notebook={{ id: 'source:knn', title: 'KNN' }} />)
    expect(screen.getByText('chatCode.inNotebook')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chatCode.run' }))
    await waitFor(() => expect(screen.getByText('(100, 5)')).toBeInTheDocument())
    expect(getSession('source:knn').status).toBe('ready')
    fireEvent.click(screen.getByRole('button', { name: /chatFocus.addToNotebook/ }))
    expect(getSession('source:knn').extra.map(cell => cell.source)).toEqual(['print(df.shape)'])
  })
})
