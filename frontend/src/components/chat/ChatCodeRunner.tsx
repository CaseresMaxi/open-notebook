'use client'

import { useRef, useState } from 'react'
import { ListPlus, Loader2, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import { CellOutputs } from '@/components/jupyter/CellOutputs'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { useTranslation } from '@/lib/hooks/use-translation'
import { addChatCell, restartSession, runInSession, useJupyterSessionStore } from '@/lib/stores/jupyter-session-store'
import type { NotebookOutput } from '@/lib/types/jupyter'

export const RUNNABLE_LANGUAGES = new Set(['python', 'py', 'python3'])

export interface CodeNotebook {
  id: string
  title: string
}

/**
 * Run a Python block from a chat answer in the browser (Pyodide), with its
 * output below it. With a Jupyter notebook in focus it runs in that notebook's
 * session (same variables) and can be added to it as a cell; otherwise each
 * chat has a Python session of its own.
 */
export function ChatCodeRunner({ code, sessionKey, notebook }: { code: string; sessionKey: string; notebook?: CodeNotebook | null }) {
  const { t } = useTranslation()
  const { openModal } = useModalManager()
  const key = notebook?.id ?? sessionKey
  const status = useJupyterSessionStore(state => state.sessions[key]?.status ?? 'idle')
  const installing = useJupyterSessionStore(state => state.sessions[key]?.installing)
  const [outputs, setOutputs] = useState<NotebookOutput[] | null>(null)
  const [running, setRunning] = useState(false)
  const ticket = useRef(0)

  const run = async () => {
    const mine = ++ticket.current
    setRunning(true)
    setOutputs([])
    await runInSession(key, code, output => {
      if (mine === ticket.current) setOutputs(previous => [...(previous ?? []), output])
    })
    if (mine === ticket.current) setRunning(false)
  }

  const stop = () => {
    ticket.current++
    restartSession(key)
    setRunning(false)
    setOutputs(previous => [...(previous ?? []), { type: 'stream', name: 'stderr', text: t('chatCode.stopped') }])
  }

  const addToNotebook = () => {
    if (!notebook) return
    addChatCell(notebook.id, code)
    toast.success(t('chatFocus.cellAdded', { name: notebook.title || t('sources.untitledSource') }), {
      action: { label: t('chatFocus.openNotebook'), onClick: () => openModal('source', notebook.id) },
    })
  }

  const loading = running && status === 'loading'
  const packages = installing?.split(',').map(name => name.trim()).filter(Boolean) ?? []
  const installingText = packages.length > 3 ? `${packages.slice(0, 3).join(', ')} +${packages.length - 3}` : packages.join(', ')
  return (
    <div className="chat-code-run">
      <div className="chat-code-actions">
        {running ? (
          <button type="button" className="code-block-action-button" onClick={stop}>
            <Square className="size-3.5" aria-hidden="true" />{t('chatCode.stop')}
          </button>
        ) : (
          <button type="button" className="code-block-action-button" onClick={() => void run()}>
            <Play className="size-3.5" aria-hidden="true" />{outputs ? t('chatCode.runAgain') : t('chatCode.run')}
          </button>
        )}
        {notebook && (
          <button type="button" className="code-block-action-button" onClick={addToNotebook}>
            <ListPlus className="size-3.5" aria-hidden="true" />{t('chatFocus.addToNotebook')}
          </button>
        )}
        <span className="chat-code-where" role="status" aria-live="polite">
          {running && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {loading
            ? t('jupyter.kernelLoading')
            : running && packages.length
              ? t('jupyter.installing', { name: installingText })
              : notebook
                ? t('chatCode.inNotebook', { name: notebook.title || t('sources.untitledSource') })
                : t('chatCode.inChat')}
        </span>
      </div>
      {outputs && outputs.length > 0 && <CellOutputs outputs={outputs} cellNumber={0} figureAlt={t('chatCode.figureAlt')} />}
      {outputs && !outputs.length && !running && <p className="chat-code-empty">{t('chatCode.noOutput')}</p>}
    </div>
  )
}
