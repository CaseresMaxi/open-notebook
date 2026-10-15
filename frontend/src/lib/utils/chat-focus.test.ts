import { describe, expect, it } from 'vitest'
import { EMPTY_SESSION, EXTRA_CELL_BASE, type NotebookSession } from '@/lib/stores/jupyter-session-store'
import { liveNotebook, notebookIdFromPath } from './chat-focus'

const session = (change: Partial<NotebookSession>): NotebookSession => ({ ...EMPTY_SESSION, ...change })

describe('notebookIdFromPath', () => {
  it('reads the study notebook from the route', () => {
    expect(notebookIdFromPath('/notebooks/notebook%3Aabc')).toBe('notebook:abc')
    expect(notebookIdFromPath('/notebooks/notebook%3Aabc/extra')).toBe('notebook:abc')
    expect(notebookIdFromPath('/sources/source:1')).toBeNull()
    expect(notebookIdFromPath(null)).toBeNull()
  })
})

describe('liveNotebook', () => {
  it('is empty until the notebook was opened in this tab', () => {
    expect(liveNotebook('source:1', EMPTY_SESSION)).toBeNull()
  })

  it('numbers code cells like the notebook and reports what the student did', () => {
    const live = liveNotebook('source:1', session({
      title: 'KNN',
      cells: [
        { index: 0, id: 'a', type: 'markdown', source: '# Datos', execution_count: null, outputs: [] },
        { index: 1, id: 'b', type: 'code', source: 'x = 1', execution_count: 3, outputs: [{ type: 'stream', name: 'stdout', text: 'viejo\n' }] },
        { index: 2, id: 'c', type: 'code', source: 'x +', execution_count: null, outputs: [] },
        { index: 3, id: 'd', type: 'code', source: 'y', execution_count: null, outputs: [] },
      ],
      extra: [{ index: EXTRA_CELL_BASE, id: 'chat', type: 'code', source: 'print(x)', execution_count: null, outputs: [] }],
      edits: { 2: 'x + (' },
      live: { 2: [{ type: 'error', ename: 'SyntaxError', evalue: 'never closed', traceback: '' }] },
    }))
    expect(live?.title).toBe('KNN')
    expect(live?.cells.map(cell => [cell.kind, cell.number, cell.status])).toEqual([
      ['markdown', 0, 'not_run'], ['code', 1, 'saved'], ['code', 2, 'error'], ['code', 3, 'not_run'], ['code', 4, 'not_run'],
    ])
    expect(live?.cells[1].output).toBe('viejo')
    expect(live?.cells[2]).toMatchObject({ code: 'x + (', edited: true, output: 'SyntaxError: never closed' })
    expect(live?.cells[4]).toMatchObject({ from_chat: true, code: 'print(x)' })
  })
})
