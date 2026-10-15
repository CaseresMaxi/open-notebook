'use client'

import { useCallback, useMemo } from 'react'
import { Crosshair, X } from 'lucide-react'
import { useNotebookChat } from '@/lib/hooks/use-notebook-chat'
import { useNotes } from '@/lib/hooks/use-notes'
import { ChatPanel } from '@/components/sources/ChatPanel'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import { ContextSelections } from '../[id]/page'
import { useTranslation } from '@/lib/hooks/use-translation'
import { NotebookContextDialog } from '@/components/sources/NotebookContextDialog'
import type { ContextMode, NoteContextMode } from '@/lib/types/notebook-context'
import { SourceListResponse } from '@/lib/types/api'
import { ChatSkeleton } from '@/components/common/LoadingSkeletons'
import { useChatFocusStore, useFocusedSources } from '@/lib/stores/chat-focus-store'
import { getSession, useJupyterSessionStore } from '@/lib/stores/jupyter-session-store'
import { liveNotebook } from '@/lib/utils/chat-focus'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import type { ChatFocus } from '@/lib/types/api'

const isJupyter = (source: SourceListResponse) => !!source.asset?.file_path?.toLowerCase().endsWith('.ipynb')

interface ChatColumnProps {
  onSourceContextChange?: (id: string, mode: ContextMode) => void
  onNoteContextChange?: (id: string, mode: NoteContextMode) => void
  onExcludeMaterials?: () => void
  notebookId: string
  contextSelections: ContextSelections
  sources: SourceListResponse[]
  sourcesLoading: boolean
}

export function ChatColumn({ notebookId, contextSelections, sources, sourcesLoading, onSourceContextChange, onNoteContextChange, onExcludeMaterials }: ChatColumnProps) {
  const { t } = useTranslation()
  const { openModal } = useModalManager()

  // Fetch notes for this notebook
  const { data: notes = [], isLoading: notesLoading } = useNotes(notebookId)

  // Focus: the chat reads only the focused sources, in full. A Jupyter notebook
  // with a session in this tab sends what is on screen instead (edits, results).
  const focusIds = useFocusedSources(notebookId)
  const unfocus = useChatFocusStore(state => state.unfocus)
  const clearFocus = useChatFocusStore(state => state.clear)
  const draft = useChatFocusStore(state => (state.draft?.notebookId === notebookId ? state.draft : null))
  const takeDraft = useChatFocusStore(state => state.takeDraft)
  const focused = useMemo(() => sources.filter(source => focusIds.includes(source.id)), [sources, focusIds])
  const liveIds = useJupyterSessionStore(useCallback(state => focused
    .filter(source => isJupyter(source) && (state.sessions[source.id]?.cells.length ?? 0) > 0)
    .map(source => source.id).join(','), [focused]))
  const effectiveSelections = useMemo<ContextSelections>(() => {
    if (!focused.length) return contextSelections
    const live = new Set(liveIds.split(',').filter(Boolean))
    return {
      sources: Object.fromEntries(sources.map(source => [source.id,
        !focusIds.includes(source.id) ? 'off' : live.has(source.id) ? 'insights' : 'full'])),
      notes: Object.fromEntries(notes.map(note => [note.id, 'off'])),
    }
  }, [focused.length, contextSelections, liveIds, sources, focusIds, notes])
  const getFocus = useCallback((): ChatFocus | undefined => {
    if (!focused.length) return undefined
    const notebooks = focused.filter(isJupyter)
      .map(source => liveNotebook(source.id, getSession(source.id)))
      .filter((notebook): notebook is NonNullable<typeof notebook> => !!notebook)
      .slice(0, 4)
    return { source_ids: focused.map(source => source.id).slice(0, 50), notebooks }
  }, [focused])
  const focusedNotebook = focused.find(isJupyter)
  const codeNotebook = useMemo(() => focusedNotebook ? { id: focusedNotebook.id, title: focusedNotebook.title ?? '' } : null, [focusedNotebook])

  // Initialize notebook chat hook
  const chat = useNotebookChat({
    notebookId,
    sources,
    notes,
    contextSelections: effectiveSelections,
    getFocus,
  })

  // Calculate context stats for indicator
  const contextStats = useMemo(() => {
    let sourcesInsights = 0
    let sourcesFull = 0
    let notesCount = 0

    // Count sources by mode
    sources.forEach(source => {
      const mode = effectiveSelections.sources[source.id]
      if (mode === 'insights') {
        sourcesInsights++
      } else if (mode === 'full') {
        sourcesFull++
      }
    })

    // Count notes that are included (not 'off')
    notes.forEach(note => {
      const mode = effectiveSelections.notes[note.id]
      if (mode === 'full') {
        notesCount++
      }
    })

    return {
      sourcesInsights,
      sourcesFull,
      notesCount,
      tokenCount: chat.tokenCount,
      charCount: chat.charCount
    }
  }, [sources, notes, effectiveSelections, chat.tokenCount, chat.charCount])

  // Show loading state while sources/notes are being fetched
  if (sourcesLoading || notesLoading) {
    return (
      <Card className="h-full flex flex-col">
        <CardContent className="flex-1 px-4">
          <ChatSkeleton />
        </CardContent>
      </Card>
    )
  }

  // Show error state if data fetch failed (unlikely but good to handle)
  if (!sources && !notes) {
    return (
      <Card className="h-full flex flex-col">
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">{t('chat.unableToLoadChat')}</p>
            <p className="text-xs mt-2">{t('common.refreshPage') || 'Please try refreshing the page'}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const focusBar = focused.length > 0 ? (
    <div className="chat-focus-bar" role="group" aria-label={t('chatFocus.label')}>
      <span className="chat-focus-title"><Crosshair className="size-3.5" aria-hidden="true" /><span className="chat-focus-label">{t('chatFocus.label')}</span></span>
      {focused.map(source => (
        <span key={source.id} className="chat-focus-chip">
          <button type="button" className="chat-focus-name" onClick={() => openModal('source', source.id)} title={source.title ?? ''}>
            {source.title || t('sources.untitledSource')}
          </button>
          <button type="button" className="chat-focus-remove" onClick={() => unfocus(notebookId, source.id)}
            aria-label={t('chatFocus.removeNamed', { name: source.title || t('sources.untitledSource') })}>
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      <button type="button" className="chat-focus-clear" onClick={() => clearFocus(notebookId)}>{t('chatFocus.clear')}</button>
      {focusedNotebook && <p className="chat-focus-hint">{t('chatFocus.notebookHint')}</p>}
    </div>
  ) : null

  return (
    <ChatPanel
      headerActions={<NotebookContextDialog
        sources={sources} notes={notes} selections={contextSelections}
        onSourceChange={onSourceContextChange} onNoteChange={onNoteContextChange}
        onExcludeMaterials={onExcludeMaterials}
        memory={chat.memory} loading={chat.loadingMemory} error={chat.memoryError}
        hasSession={!!chat.currentSessionId} busy={chat.isSending || chat.changingMemory}
        onMemoryChange={chat.changeMemory} materialTokens={chat.tokenCount}
      />}
      title={t('chat.chatWithNotebook')}
      contextType="notebook"
      messages={chat.messages}
      isStreaming={chat.isSending || chat.changingMemory}
      contextIndicators={null}
      onSendMessage={chat.sendMessage}
      modelOverride={chat.currentSession?.model_override ?? chat.pendingModelOverride ?? undefined}
      onModelChange={(model) => chat.setModelOverride(model ?? null)}
      sessions={chat.sessions}
      currentSessionId={chat.currentSessionId}
      onCreateSession={(title) => chat.createSession(title)}
      onSelectSession={chat.switchSession}
      onUpdateSession={(sessionId, title) => chat.updateSession(sessionId, { title })}
      onDeleteSession={chat.deleteSession}
      loadingSessions={chat.loadingSessions}
      loadingMessages={chat.loadingMessages}
      notebookContextStats={contextStats}
      notebookId={notebookId}
      composerTop={focusBar}
      draft={draft}
      onDraftUsed={() => takeDraft(notebookId)}
      codeNotebook={codeNotebook}
    />
  )
}
