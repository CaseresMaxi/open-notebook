import { usePathname } from 'next/navigation'
import { outputsText } from '@/components/jupyter/CellOutputs'
import type { LiveCell, LiveNotebook } from '@/lib/types/jupyter'
import { allCells, cellCode, EXTRA_CELL_BASE, type NotebookSession } from '@/lib/stores/jupyter-session-store'

/** The notebook (study notebook, not Jupyter) the current page belongs to, if any. */
export function notebookIdFromPath(pathname: string | null | undefined): string | null {
  const match = /^\/notebooks\/([^/?#]+)/.exec(pathname ?? '')
  return match ? decodeURIComponent(match[1]) : null
}

export function useCurrentNotebookId(): string | null {
  return notebookIdFromPath(usePathname())
}

const CODE_LIMIT = 6000
const OUTPUT_LIMIT = 1500

/**
 * What the student has on screen for a Jupyter notebook: edited code, the
 * results of this session (or the saved ones) and errors, numbered like the
 * notebook shows them, so the chat can talk about "cell 7".
 */
export function liveNotebook(sourceId: string, session: NotebookSession): LiveNotebook | null {
  if (!session.cells.length && !session.extra.length) return null
  let number = 0
  const cells: LiveCell[] = []
  for (const cell of allCells(session)) {
    if (cell.type !== 'code') {
      if (cell.type === 'markdown' && cell.source.trim()) {
        cells.push({ number: 0, kind: 'markdown', code: cell.source.slice(0, 1200), edited: false, from_chat: false, status: 'not_run', output: '' })
      }
      continue
    }
    number++
    const live = session.live[cell.index]
    const outputs = live ?? cell.outputs
    const failed = outputs.some(output => output.type === 'error')
    const code = cellCode(session, cell)
    cells.push({
      number,
      kind: 'code',
      code: code.length > CODE_LIMIT ? `${code.slice(0, CODE_LIMIT)}\n…` : code,
      edited: code !== cell.source,
      from_chat: cell.index >= EXTRA_CELL_BASE,
      status: session.running === cell.index ? 'running' : live ? (failed ? 'error' : 'ran') : outputs.length ? 'saved' : 'not_run',
      output: outputsText(outputs, OUTPUT_LIMIT),
    })
  }
  return { source_id: sourceId, title: session.title.slice(0, 300), cells: cells.slice(0, 600) }
}
