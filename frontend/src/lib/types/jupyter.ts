export type NotebookOutput =
  | { type: 'stream'; name: 'stdout' | 'stderr'; text: string }
  | { type: 'display'; data: Record<string, string> }
  | { type: 'error'; ename: string; evalue: string; traceback: string }

export interface NotebookCell {
  index: number
  id: string
  type: 'code' | 'markdown' | 'raw'
  source: string
  execution_count: number | null
  outputs: NotebookOutput[]
}

export interface NotebookDocument {
  language: string
  cells: NotebookCell[]
  /** Tutor explanations keyed by cell index (cached on the server). */
  explanations: Record<string, string>
}

/** `saved`: not run in this session; the output is the one stored in the file. */
export type LiveCellStatus = 'not_run' | 'saved' | 'ran' | 'error' | 'running'

export interface LiveCell {
  number: number
  kind: 'code' | 'markdown'
  code: string
  edited: boolean
  from_chat: boolean
  status: LiveCellStatus
  output: string
}

export interface LiveNotebook {
  source_id: string
  title: string
  cells: LiveCell[]
}
