'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus2, Loader2, Pencil, Play, PlayCircle, RotateCcw, Sparkles, Square, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { LiquidSurface } from '@/components/layout/LiquidSurface'
import { LoadError } from '@/components/common/LoadingSkeletons'
import { jupyterApi } from '@/lib/api/jupyter'
import { useJupyterNotebook, useNotebookExplanations } from '@/lib/hooks/use-jupyter'
import { useTranslation } from '@/lib/hooks/use-translation'
import { PythonKernel, type KernelStatus } from '@/lib/python/kernel'
import type { NotebookCell, NotebookOutput } from '@/lib/types/jupyter'
import { cn } from '@/lib/utils'
import { CellOutputs, outputsText } from './CellOutputs'

type RunExplanation = { state: 'loading' | 'done' | 'error'; text?: string }

const EXPLAIN_RUNS_KEY = 'jupyter-explain-runs'

function readPreference() {
  try { return localStorage.getItem(EXPLAIN_RUNS_KEY) !== 'off' } catch { return true }
}

/** Nearest Markdown before a cell: the notebook's own framing of that step. */
function precedingMarkdown(cells: NotebookCell[], index: number) {
  for (let i = cells.findIndex(cell => cell.index === index) - 1; i >= 0; i--) {
    if (cells[i].type === 'markdown') return cells[i].source.slice(0, 1500)
  }
  return ''
}

function Tutor({ explanation, pending, run }: { explanation?: string; pending: boolean; run?: RunExplanation }) {
  const { t } = useTranslation()
  if (!explanation && !pending && !run) return null
  return (
    <aside className="jnb-tutor" aria-label={t('jupyter.tutor')}>
      <p className="jnb-tutor-label"><Sparkles className="size-3.5" aria-hidden="true" />{t('jupyter.tutor')}</p>
      {explanation ? (
        <MarkdownRenderer>{explanation}</MarkdownRenderer>
      ) : pending ? (
        <div className="jnb-tutor-loading" role="status">
          <span className="sr-only">{t('jupyter.explaining')}</span>
          <span /><span /><span />
        </div>
      ) : null}
      {run && (
        <div className="jnb-tutor-run" aria-live="polite">
          <p className="jnb-tutor-label">{t('jupyter.resultExplanation')}</p>
          {run.state === 'loading' ? (
            <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-3.5 animate-spin" />{t('jupyter.explainingResult')}</p>
          ) : run.state === 'error' ? (
            <p className="text-sm text-muted-foreground">{t('jupyter.explainResultError')}</p>
          ) : (
            <MarkdownRenderer>{run.text ?? ''}</MarkdownRenderer>
          )}
        </div>
      )}
    </aside>
  )
}

interface CodeCellProps {
  number: number
  language: string
  code: string
  edited: boolean
  outputs: NotebookOutput[]
  live: boolean
  count: number | null
  running: boolean
  queued: boolean
  blocked: boolean
  onChange: (code: string) => void
  onReset: () => void
  onRun: () => void
}

function CodeCell({ number, language, code, edited, outputs, live, count, running, queued, blocked, onChange, onReset, onRun }: CodeCellProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight + 2}px`
  }, [code, editing])
  return (
    <div className="jnb-code">
      <div className="jnb-code-bar">
        <Button
          size="icon" variant="ghost" className="size-10 rounded-full"
          onClick={onRun} disabled={blocked}
          aria-label={t('jupyter.runCell', { n: number })} title={t('jupyter.runCell', { n: number })}
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        </Button>
        <span className="jnb-count" aria-label={count ? t('jupyter.executionCount', { n: count }) : undefined}>
          [{running ? '*' : queued ? '·' : count ?? ' '}]
        </span>
        <span className="ml-auto flex items-center gap-1">
          {edited && (
            <Button size="sm" variant="ghost" onClick={onReset} title={t('jupyter.resetCell')}>
              <Undo2 className="mr-1 size-3.5" />{t('jupyter.resetCell')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(value => !value)} aria-pressed={editing}>
            <Pencil className="mr-1 size-3.5" />{editing ? t('jupyter.doneEditing') : t('jupyter.edit')}
          </Button>
        </span>
      </div>
      {editing ? (
        <textarea
          ref={textarea}
          className="jnb-editor"
          value={code}
          spellCheck={false}
          aria-label={t('jupyter.codeOf', { n: number })}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && (event.shiftKey || event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              if (!blocked) onRun()
            }
            if (event.key === 'Tab' && !event.shiftKey) {
              event.preventDefault()
              const { selectionStart, selectionEnd } = event.currentTarget
              onChange(`${code.slice(0, selectionStart)}    ${code.slice(selectionEnd)}`)
              requestAnimationFrame(() => textarea.current?.setSelectionRange(selectionStart + 4, selectionStart + 4))
            }
          }}
        />
      ) : (
        <button type="button" className="jnb-source" onClick={() => setEditing(true)} aria-label={t('jupyter.codeOf', { n: number })}>
          <MarkdownRenderer>{`\`\`\`${language}\n${code}\n\`\`\``}</MarkdownRenderer>
        </button>
      )}
      {outputs.length > 0 && !live && <p className="jnb-saved-label">{t('jupyter.savedOutput')}</p>}
      <CellOutputs outputs={outputs} cellNumber={number} />
    </div>
  )
}

const STATUS_LABEL: Record<KernelStatus, string> = {
  idle: 'jupyter.kernelIdle', loading: 'jupyter.kernelLoading', ready: 'jupyter.kernelReady',
  busy: 'jupyter.kernelBusy', error: 'jupyter.kernelError',
}

/** A Jupyter notebook source: read it, run it in the browser, learn from a tutor beside each cell. */
export function JupyterNotebook({ sourceId }: { sourceId: string }) {
  const { t, language } = useTranslation()
  const notebook = useJupyterNotebook(sourceId, language)
  const explain = useNotebookExplanations(sourceId, language)
  const [edits, setEdits] = useState<Record<number, string>>({})
  const [live, setLive] = useState<Record<number, NotebookOutput[]>>({})
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [running, setRunning] = useState<number | null>(null)
  const [queue, setQueue] = useState<number[]>([])
  const [status, setStatus] = useState<KernelStatus>('idle')
  const [installing, setInstalling] = useState<string | undefined>()
  const [files, setFiles] = useState<string[]>([])
  const [explainRuns, setExplainRuns] = useState(true)
  const [runs, setRuns] = useState<Record<number, RunExplanation>>({})
  const kernel = useRef<PythonKernel | null>(null)
  const counter = useRef(0)
  const generation = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const requested = useRef(false)

  const [elapsed, setElapsed] = useState(0)

  useEffect(() => { setExplainRuns(readPreference()) }, [])
  // Some cells (model sweeps) take a minute in WebAssembly: show they are alive.
  useEffect(() => {
    setElapsed(0)
    if (running === null) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [running])
  useEffect(() => () => kernel.current?.dispose(), [])

  const data = notebook.data
  const cells = useMemo(() => data?.cells ?? [], [data])
  const codeCells = useMemo(() => cells.filter(cell => cell.type === 'code'), [cells])
  const numbers = useMemo(() => new Map(codeCells.map((cell, position) => [cell.index, position + 1])), [codeCells])
  const explanations = data?.explanations ?? {}
  const hasExplanations = Object.keys(explanations).length > 0

  // Explanations are generated once per notebook and language, then cached by the API.
  useEffect(() => {
    if (data && !hasExplanations && codeCells.length && !requested.current) {
      requested.current = true
      explain.mutate(false)
    }
  }, [data, hasExplanations, codeCells.length, explain])

  const getKernel = useCallback(() => {
    if (!kernel.current) {
      kernel.current = new PythonKernel((next, detail) => {
        setStatus(next)
        setInstalling(next === 'busy' || next === 'loading' ? detail : undefined)
      })
    }
    kernel.current.start()
    return kernel.current
  }, [])

  const explainRun = useCallback(async (cell: NotebookCell, code: string, outputs: NotebookOutput[]) => {
    setRuns(previous => ({ ...previous, [cell.index]: { state: 'loading' } }))
    try {
      const text = await jupyterApi.explainOutput(sourceId, {
        code, output: outputsText(outputs), context: precedingMarkdown(cells, cell.index), language,
      })
      setRuns(previous => ({ ...previous, [cell.index]: { state: 'done', text } }))
    } catch {
      setRuns(previous => ({ ...previous, [cell.index]: { state: 'error' } }))
    }
  }, [cells, language, sourceId])

  const runCell = useCallback(async (cell: NotebookCell): Promise<boolean> => {
    const ticket = generation.current
    const code = edits[cell.index] ?? cell.source
    const collected: NotebookOutput[] = []
    setRunning(cell.index)
    setLive(previous => ({ ...previous, [cell.index]: [] }))
    const ok = await getKernel().run(code, output => {
      collected.push(output)
      setLive(previous => ({ ...previous, [cell.index]: [...(previous[cell.index] ?? []), output] }))
    })
    if (ticket !== generation.current) return false
    const count = ++counter.current
    setCounts(previous => ({ ...previous, [cell.index]: count }))
    setRunning(current => (current === cell.index ? null : current))
    if (explainRuns && code.trim()) void explainRun(cell, code, collected)
    return ok
  }, [edits, explainRun, explainRuns, getKernel])

  const runAll = async () => {
    const ticket = generation.current
    setQueue(codeCells.map(cell => cell.index))
    for (const cell of codeCells) {
      if (ticket !== generation.current) return
      setQueue(previous => previous.filter(index => index !== cell.index))
      const ok = await runCell(cell)
      if (!ok) break // like Jupyter: stop at the first error
    }
    setQueue([])
  }

  const restart = () => {
    generation.current++
    counter.current = 0
    setQueue([]); setRunning(null); setLive({}); setCounts({}); setRuns({}); setFiles([])
    kernel.current?.restart()
  }

  const addFiles = async (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) {
      const name = await getKernel().addFile(file)
      setFiles(previous => [...new Set([...previous, name])])
    }
    if (fileInput.current) fileInput.current.value = ''
  }

  const toggleExplainRuns = (value: boolean) => {
    setExplainRuns(value)
    try { localStorage.setItem(EXPLAIN_RUNS_KEY, value ? 'on' : 'off') } catch { /* preference only */ }
  }

  if (notebook.isPending) {
    return <div className="jnb-skeleton" role="status"><span className="sr-only">{t('common.loading')}</span><span /><span /><span /></div>
  }
  if (notebook.isError || !data) return <LoadError onRetry={() => notebook.refetch()} />

  const busy = status === 'busy' || running !== null || queue.length > 0
  const packages = installing?.split(',').map(name => name.trim()).filter(Boolean) ?? []
  const statusText = packages.length && (status === 'busy' || status === 'loading')
    ? t('jupyter.installing', { name: packages.length > 3 ? `${packages.slice(0, 3).join(', ')} +${packages.length - 3}` : packages.join(', ') })
    : status === 'busy' && elapsed >= 3
      ? `${t(STATUS_LABEL[status])} ${elapsed} s`
      : t(STATUS_LABEL[status])

  return (
    <div className="jnb">
      <LiquidSurface className="jnb-toolbar" radius={20}>
        <div className="jnb-toolbar-row">
          <span className={cn('jnb-status', `jnb-status-${status}`)} role="status" aria-live="polite">
            <span className="jnb-status-dot" aria-hidden="true" />{statusText}
          </span>
          <span className="jnb-toolbar-actions">
            <Button size="sm" onClick={runAll} disabled={busy || !codeCells.length}>
              <PlayCircle className="mr-1.5 size-4" />{t('jupyter.runAll')}
            </Button>
            <Button size="sm" variant="ghost" onClick={restart} disabled={status === 'idle'}
              title={busy ? t('jupyter.stopHint') : undefined}>
              {busy ? <Square className="mr-1.5 size-4" /> : <RotateCcw className="mr-1.5 size-4" />}
              {busy ? t('jupyter.stop') : t('jupyter.restart')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
              <FilePlus2 className="mr-1.5 size-4" />{t('jupyter.addData')}
            </Button>
            <input ref={fileInput} type="file" multiple hidden onChange={event => void addFiles(event.target.files)} />
          </span>
        </div>
        <div className="jnb-toolbar-row jnb-toolbar-secondary">
          <label className="flex items-center gap-2">
            <Checkbox checked={explainRuns} onCheckedChange={value => toggleExplainRuns(value === true)} />
            {t('jupyter.explainRuns')}
          </label>
          {explain.isPending ? (
            <span className="text-muted-foreground"><Loader2 className="mr-1.5 inline size-3.5 animate-spin" />{t('jupyter.explaining')}</span>
          ) : explain.isError ? (
            <Button size="sm" variant="ghost" onClick={() => explain.mutate(false)}>{t('jupyter.explainError')} · {t('common.retry')}</Button>
          ) : hasExplanations ? (
            <Button size="sm" variant="ghost" onClick={() => explain.mutate(true)}>
              <Sparkles className="mr-1.5 size-3.5" />{t('jupyter.regenerate')}
            </Button>
          ) : null}
        </div>
        {files.length > 0 && <p className="jnb-files">{t('jupyter.filesAvailable', { names: files.join(', ') })}</p>}
      </LiquidSurface>
      <p className="jnb-hint">{t('jupyter.browserHint')}</p>

      {cells.map(cell => {
        if (cell.type !== 'code') {
          return (
            <section key={cell.id} className="jnb-row">
              <div className="jnb-markdown">
                {cell.type === 'markdown' ? <MarkdownRenderer>{cell.source}</MarkdownRenderer> : <pre className="jnb-text">{cell.source}</pre>}
              </div>
            </section>
          )
        }
        const number = numbers.get(cell.index) ?? 0
        const code = edits[cell.index] ?? cell.source
        const liveOutputs = live[cell.index]
        return (
          <section key={cell.id} className="jnb-row jnb-row-code" aria-label={t('jupyter.cellN', { n: number })}>
            <CodeCell
              number={number}
              language={data.language}
              code={code}
              edited={edits[cell.index] !== undefined && edits[cell.index] !== cell.source}
              outputs={liveOutputs ?? cell.outputs}
              live={!!liveOutputs}
              count={counts[cell.index] ?? (liveOutputs ? null : cell.execution_count)}
              running={running === cell.index}
              queued={queue.includes(cell.index)}
              blocked={busy}
              onChange={value => setEdits(previous => ({ ...previous, [cell.index]: value }))}
              onReset={() => setEdits(previous => { const next = { ...previous }; delete next[cell.index]; return next })}
              onRun={() => void runCell(cell)}
            />
            <Tutor
              explanation={explanations[cell.index]}
              pending={explain.isPending && !explanations[cell.index]}
              run={runs[cell.index]}
            />
          </section>
        )
      })}
    </div>
  )
}

export default JupyterNotebook
