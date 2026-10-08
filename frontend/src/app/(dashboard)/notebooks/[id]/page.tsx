'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { NotebookHeader } from '../components/NotebookHeader'
import { SourcesColumn } from '../components/SourcesColumn'
import { NotesColumn } from '../components/NotesColumn'
import { SummaryLibrary } from '@/components/study/SummaryLibrary'
import { ChatColumn } from '../components/ChatColumn'
import { useNotebook } from '@/lib/hooks/use-notebooks'
import { useNotebookSources } from '@/lib/hooks/use-sources'
import { useNotes } from '@/lib/hooks/use-notes'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  applyBulkSourceContext,
  applyBulkNoteContext,
  computeSourceSelections,
  computeNoteSelections,
  type SourceContextDefault,
  type SourceBulkAction,
  type NoteContextDefault,
} from '@/lib/utils/source-context'

// Re-exported from the shared types module for backward compatibility; several
// components historically import these from this route file.
import type { ContextMode, ContextSelections, NoteContextMode } from '@/lib/types/notebook-context'
export type { ContextMode, ContextSelections, NoteContextMode }

export default function NotebookPage() {
  const { t } = useTranslation()
  const params = useParams()

  // Ensure the notebook ID is properly decoded from URL
  const notebookId = params?.id ? decodeURIComponent(params.id as string) : ''

  const { data: notebook, isLoading: notebookLoading } = useNotebook(notebookId)
  const {
    sources,
    isLoading: sourcesLoading,
    refetch: refetchSources,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useNotebookSources(notebookId)
  const { data: notes, isLoading: notesLoading } = useNotes(notebookId)

  // Get collapse states for dynamic layout


  // Detect desktop to avoid double-mounting ChatColumn


  // Mobile tab state (Sources, Notes, or Chat)
  const [mobileActiveTab, setMobileActiveTab] = useState<'sources' | 'notes' | 'summaries' | 'chat'>('chat')

  // Context selection state
  const [contextSelections, setContextSelections] = useState<ContextSelections>({
    sources: {},
    notes: {}
  })

  // The default context mode applied to sources as they load. A bulk
  // include/exclude updates this so sources loaded later via pagination follow
  // the same intent instead of reverting to "included" (#223/#915).
  const [sourceContextDefault, setSourceContextDefault] = useState<SourceContextDefault>('include')

  // Same idea for notes loaded later (notes are binary: included/off).
  const [noteContextDefault, setNoteContextDefault] = useState<NoteContextDefault>('include')

  // Initialize and update selections when sources load or change
  useEffect(() => {
    if (sources && sources.length > 0) {
      setContextSelections(prev => ({
        ...prev,
        sources: computeSourceSelections(prev.sources, sources, sourceContextDefault),
      }))
    }
  }, [sources, sourceContextDefault])

  useEffect(() => {
    if (notes && notes.length > 0) {
      setContextSelections(prev => ({
        ...prev,
        notes: computeNoteSelections(prev.notes, notes, noteContextDefault),
      }))
    }
  }, [notes, noteContextDefault])

  const handleSourceContextModeChange = (sourceId: string, mode: ContextMode) => {
    setContextSelections(prev => ({
      ...prev,
      sources: {
        ...prev.sources,
        [sourceId]: mode
      }
    }))
  }

  const handleNoteContextModeChange = (noteId: string, mode: NoteContextMode) => {
    setContextSelections(prev => ({
      ...prev,
      notes: {
        ...prev.notes,
        [noteId]: mode
      }
    }))
  }

  // Bulk-apply a context action (insights-only / full / exclude) to every
  // source at once (#223). Also records the action as the default for sources
  // loaded later (#915).
  const handleBulkSourceContext = (action: SourceBulkAction) => {
    setSourceContextDefault(action)
    setContextSelections(prev => ({
      ...prev,
      sources: applyBulkSourceContext(prev.sources, sources ?? [], action),
    }))
  }

  // Bulk include/exclude every note from the chat context at once (#223).
  const handleBulkNoteContext = (action: NoteContextDefault) => {
    setNoteContextDefault(action)
    setContextSelections(prev => ({
      ...prev,
      notes: applyBulkNoteContext(prev.notes, notes ?? [], action),
    }))
  }

  if (notebookLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!notebook) {
    return (
      <AppShell>
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">{t('notebooks.notFound')}</h1>
          <p className="text-muted-foreground">{t('notebooks.notFoundDesc')}</p>
        </div>
      </AppShell>
    )
  }

  const sourcesPanel = <SourcesColumn
    sources={sources} isLoading={sourcesLoading} notebookId={notebookId} notebookName={notebook.name}
    onRefresh={refetchSources} contextSelections={contextSelections.sources}
    onContextModeChange={handleSourceContextModeChange} onBulkContextModeChange={handleBulkSourceContext}
    hasNextPage={hasNextPage} isFetchingNextPage={isFetchingNextPage} fetchNextPage={fetchNextPage}
    standalone
  />
  const chatPanel = <ChatColumn
    notebookId={notebookId} contextSelections={contextSelections}
    onSourceContextChange={handleSourceContextModeChange} onNoteContextChange={handleNoteContextModeChange}
    onExcludeMaterials={() => { handleBulkSourceContext('exclude'); handleBulkNoteContext('exclude') }}
    sources={sources} sourcesLoading={sourcesLoading}
  />
  return <AppShell>
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 pt-4 md:px-6 md:pt-6"><NotebookHeader notebook={notebook} /></div>
      <div className="flex-1 min-h-0 p-4 md:p-6 flex flex-col">
        <Tabs value={mobileActiveTab} onValueChange={value => setMobileActiveTab(value as typeof mobileActiveTab)} className="flex flex-col flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-4 min-h-11 mb-4 shrink-0">
            <TabsTrigger value="sources">{t('navigation.sources')}</TabsTrigger>
            <TabsTrigger value="chat">{t('common.chat')}</TabsTrigger>
            <TabsTrigger value="notes">{t('common.notes')}</TabsTrigger>
            <TabsTrigger value="summaries">{t('product.summaries')}</TabsTrigger>
          </TabsList>
          <TabsContent value="sources" className="study-focus study-pane flex-1 min-h-0 overflow-hidden">{sourcesPanel}</TabsContent>
          <TabsContent value="chat" forceMount className="study-focus study-pane flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden">{chatPanel}</TabsContent>
          <TabsContent value="notes" className="study-focus study-pane flex-1 min-h-0 overflow-hidden">
            <NotesColumn notes={notes} isLoading={notesLoading} notebookId={notebookId}
              contextSelections={contextSelections.notes} onContextModeChange={handleNoteContextModeChange}
              onBulkContextModeChange={handleBulkNoteContext} standalone />
          </TabsContent>
          <TabsContent value="summaries" className="study-focus study-pane flex-1 min-h-0 overflow-y-auto product-panel">
            <SummaryLibrary key={notebookId} notebookId={notebookId} />
          </TabsContent>
        </Tabs>

      </div>
    </div>
  </AppShell>
}
