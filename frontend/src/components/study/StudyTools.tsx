'use client'

import Link from 'next/link'
import { GraduationCap } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NotesColumn } from '@/app/(dashboard)/notebooks/components/NotesColumn'
import { SummaryLibrary } from './SummaryLibrary'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { NoteResponse } from '@/lib/types/api'
import type { NoteContextMode } from '@/lib/types/notebook-context'
import type { NoteContextDefault } from '@/lib/utils/source-context'

export function StudyTools({
  notebookId,
  notes,
  isLoading,
  contextSelections,
  onContextModeChange,
  onBulkContextModeChange,
}: {
  notebookId: string
  notes?: NoteResponse[]
  isLoading: boolean
  contextSelections: Record<string, NoteContextMode>
  onContextModeChange: (id: string, mode: NoteContextMode) => void
  onBulkContextModeChange: (action: NoteContextDefault) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="study-tools flex h-full min-h-0 flex-col gap-3">
      <Tabs defaultValue="notes" className="flex flex-1 min-h-0 flex-col">
        <TabsList className="w-full grid grid-cols-2 min-h-11">
          <TabsTrigger value="notes" className="min-h-9">
            {t('common.notes')}
          </TabsTrigger>
          <TabsTrigger value="summaries" className="min-h-9">
            {t('product.summaries')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="notes" className="flex-1 min-h-0 overflow-hidden">
          <NotesColumn
            notebookId={notebookId}
            notes={notes}
            isLoading={isLoading}
            contextSelections={contextSelections}
            onContextModeChange={onContextModeChange}
            onBulkContextModeChange={onBulkContextModeChange}
            standalone
          />
        </TabsContent>
        <TabsContent
          value="summaries"
          className="flex-1 min-h-0 overflow-y-auto p-4"
        >
          <SummaryLibrary notebookId={notebookId} />
        </TabsContent>
      </Tabs>
      <Link
        href={`/exams?notebook=${encodeURIComponent(notebookId)}`}
        className="product-link px-3"
      >
        <GraduationCap className="size-4" />
        {t('exams.title')}
      </Link>
    </div>
  )
}
