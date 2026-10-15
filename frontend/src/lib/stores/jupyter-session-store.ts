import { create } from 'zustand'
import { PythonKernel, type KernelStatus } from '@/lib/python/kernel'
import type { NotebookCell, NotebookOutput } from '@/lib/types/jupyter'

export type RunExplanation = { state: 'loading' | 'done' | 'error'; text?: string }

/** Cells added from the chat live after the notebook's own (indexes from here). */
export const EXTRA_CELL_BASE = 100_000

/**
 * One notebook's working session in this tab: what the student edited, ran and
 * added. It outlives the source dialog, so closing the notebook to ask the chat
 * keeps the Python variables, outputs and edits.
 */
export interface NotebookSession {
  title: string
  language: string
  /** The notebook's saved cells, as last loaded. */
  cells: NotebookCell[]
  /** Cells the student added from the chat, run like any other. */
  extra: NotebookCell[]
  edits: Record<number, string>
  live: Record<number, NotebookOutput[]>
  counts: Record<number, number>
  runs: Record<number, RunExplanation>
  files: string[]
  status: KernelStatus
  installing?: string
  running: number | null
  queue: number[]
  /** A cell to bring into view the next time the notebook is shown. */
  reveal: number | null
  counter: number
  generation: number
}

const empty = (): NotebookSession => ({
  title: '', language: 'python', cells: [], extra: [], edits: {}, live: {}, counts: {}, runs: {},
  files: [], status: 'idle', running: null, queue: [], reveal: null, counter: 0, generation: 0,
})

interface JupyterSessionState {
  sessions: Record<string, NotebookSession>
  update: (sourceId: string, change: (session: NotebookSession) => Partial<NotebookSession>) => void
}

export const useJupyterSessionStore = create<JupyterSessionState>()(set => ({
  sessions: {},
  update: (sourceId, change) => set(state => {
    const session = state.sessions[sourceId] ?? empty()
    return { sessions: { ...state.sessions, [sourceId]: { ...session, ...change(session) } } }
  }),
}))

export const EMPTY_SESSION = empty()

export function getSession(sourceId: string): NotebookSession {
  return useJupyterSessionStore.getState().sessions[sourceId] ?? EMPTY_SESSION
}

function update(sourceId: string, change: (session: NotebookSession) => Partial<NotebookSession>) {
  useJupyterSessionStore.getState().update(sourceId, change)
}

// Each kernel is a Pyodide worker (~200 MB): keep only the most recent ones.
const MAX_KERNELS = 2
const kernels = new Map<string, PythonKernel>()

export function kernelFor(sourceId: string): PythonKernel {
  let kernel = kernels.get(sourceId)
  if (kernel) {
    kernels.delete(sourceId)
  } else {
    kernel = new PythonKernel((status, detail) => update(sourceId, () => ({
      status, installing: status === 'busy' || status === 'loading' ? detail : undefined,
    })))
  }
  kernels.set(sourceId, kernel)
  for (const [id, old] of kernels) {
    if (kernels.size <= MAX_KERNELS) break
    old.dispose()
    kernels.delete(id)
    resetRun(id)
  }
  kernel.start()
  return kernel
}

function resetRun(sourceId: string) {
  update(sourceId, session => ({
    generation: session.generation + 1, counter: 0, queue: [], running: null,
    live: {}, counts: {}, runs: {}, files: [], status: 'idle',
  }))
}

export function allCells(session: NotebookSession): NotebookCell[] {
  return [...session.cells, ...session.extra]
}

export function cellCode(session: NotebookSession, cell: NotebookCell): string {
  return session.edits[cell.index] ?? cell.source
}

/** Runs one cell; outputs stream into the session even if no notebook is on screen. */
export async function runSessionCell(
  sourceId: string,
  cell: NotebookCell,
  onDone?: (code: string, outputs: NotebookOutput[]) => void,
): Promise<boolean> {
  const ticket = getSession(sourceId).generation
  const code = cellCode(getSession(sourceId), cell)
  const collected: NotebookOutput[] = []
  update(sourceId, session => ({ running: cell.index, live: { ...session.live, [cell.index]: [] } }))
  const ok = await kernelFor(sourceId).run(code, output => {
    collected.push(output)
    update(sourceId, session => ({ live: { ...session.live, [cell.index]: [...(session.live[cell.index] ?? []), output] } }))
  })
  if (ticket !== getSession(sourceId).generation) return false
  update(sourceId, session => ({
    counter: session.counter + 1,
    counts: { ...session.counts, [cell.index]: session.counter + 1 },
    running: session.running === cell.index ? null : session.running,
  }))
  onDone?.(code, collected)
  return ok
}

export async function runAllCells(sourceId: string, onDone?: (cell: NotebookCell, code: string, outputs: NotebookOutput[]) => void) {
  const ticket = getSession(sourceId).generation
  const code = allCells(getSession(sourceId)).filter(cell => cell.type === 'code')
  update(sourceId, () => ({ queue: code.map(cell => cell.index) }))
  for (const cell of code) {
    if (ticket !== getSession(sourceId).generation) return
    update(sourceId, session => ({ queue: session.queue.filter(index => index !== cell.index) }))
    const ok = await runSessionCell(sourceId, cell, (text, outputs) => onDone?.(cell, text, outputs))
    if (!ok) break // like Jupyter: stop at the first error
  }
  update(sourceId, () => ({ queue: [] }))
}

/** Throws the Python session away (also the only way to stop a running cell). */
export function restartSession(sourceId: string) {
  const kernel = kernels.get(sourceId)
  resetRun(sourceId)
  kernel?.restart()
}

export async function addSessionFiles(sourceId: string, list: File[]) {
  for (const file of list) {
    const name = await kernelFor(sourceId).addFile(file)
    update(sourceId, session => ({ files: [...new Set([...session.files, name])] }))
  }
}

/** Appends code from the chat as a new cell; it is shown when the notebook opens. */
export function addChatCell(sourceId: string, code: string): number {
  let index = EXTRA_CELL_BASE
  update(sourceId, session => {
    index = EXTRA_CELL_BASE + session.extra.length
    const cell: NotebookCell = { index, id: `chat-${index}`, type: 'code', source: code.replace(/\n+$/, ''), execution_count: null, outputs: [] }
    return { extra: [...session.extra, cell], reveal: index }
  })
  return index
}

export function removeChatCell(sourceId: string, index: number) {
  update(sourceId, session => ({ extra: session.extra.filter(cell => cell.index !== index) }))
}

/** Test helper: forget every session and kernel. */
export function resetJupyterSessions() {
  for (const kernel of kernels.values()) kernel.dispose()
  kernels.clear()
  useJupyterSessionStore.setState({ sessions: {} })
}
