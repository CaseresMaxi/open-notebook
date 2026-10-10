'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlignLeft } from 'lucide-react'
import { LiquidSurface } from '@/components/layout/LiquidSurface'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useNotebookSources } from '@/lib/hooks/use-sources'
import { useNotes } from '@/lib/hooks/use-notes'
import { generateStudySummary } from '@/lib/api/study'
import { transformationsApi } from '@/lib/api/transformations'
import { useTranslation } from '@/lib/hooks/use-translation'
import { isStudySummary } from '@/lib/utils/study-summary'
import { NoteEditorDialog } from '@/app/(dashboard)/notebooks/components/NoteEditorDialog'
import type { NoteResponse } from '@/lib/types/api'

export function SummaryLibrary({ notebookId, standalone = false }: { notebookId: string; standalone?: boolean }) {
  const { t, language } = useTranslation()
  const client = useQueryClient()
  const {
    data: notes = [],
    isLoading,
    isError,
    refetch,
  } = useNotes(notebookId, { summariesOnly: true })
  const {
    sources = [],
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useNotebookSources(notebookId)
  const templates = useQuery({
    queryKey: ['transformations'],
    queryFn: transformationsApi.list,
  })
  const [sourceId, setSourceId] = useState('')
  const [editing, setEditing] = useState<NoteResponse | undefined>()
  const [status, setStatus] = useState('')
  const summaries = notes.filter(isStudySummary)
  const generate = useMutation({
    retry: false,
    mutationFn: async () => {
      const selectedNotebook = notebookId
      const template = templates.data?.find((item) =>
        /summar|resumen|résumé/i.test(item.name + ' ' + item.title)
      )
      if (!template) throw new Error(t('product.summaryTemplateMissing'))
      return generateStudySummary({
        notebookId: selectedNotebook,
        sourceId,
        templateId: template.id,
        instructions: t('product.summaryInstructions', { language }),
        title: (sourceTitle) =>
          t('product.summaryTitle', { title: sourceTitle }),
        sourceLabel: t('product.sourceLink'),
        emptyError: t('product.summaryEmpty'),
        outputError: t('product.summaryFailed'),
      })
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['notes'] })
      client.invalidateQueries({ queryKey: ['notebooks'] })
      setStatus(t('product.summarySaved'))
    },
    onError: (error) =>
      setStatus(
        error instanceof Error ? error.message : t('product.summaryFailed')
      ),
  })
  return (
    <div className={`summary-library ${standalone ? 'study-materials study-summaries' : ''}`}>
      {standalone && <header className="study-summary-heading"><h2>{t('product.summaries')}</h2></header>}
      <div className="summary-create">
      <LiquidSurface className="summary-create-glass">
      <div className="summary-create-controls">
        <Select
          value={sourceId}
          onValueChange={(value) => {
            setSourceId(value)
            setStatus('')
          }}
          disabled={generate.isPending}
        >
          <SelectTrigger
            className="w-full min-h-11"
            aria-label={t('product.chooseSource')}
          >
            <SelectValue placeholder={t('product.chooseSource')} />
          </SelectTrigger>
          <SelectContent>
            {sources.map((source) => (
              <SelectItem key={source.id} value={source.id}>
                {source.title || t('common.untitled')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasNextPage && (
          <Button
            variant="ghost"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            {t('product.loadMoreSources')}
          </Button>
        )}
        <Button
          variant="outline"
          disabled={
            !sourceId ||
            generate.isPending ||
            templates.isLoading ||
            !templates.data
          }
          onClick={() => {
            setStatus('')
            generate.mutate()
          }}
        >
          {generate.isPending
            ? t('product.generatingSummary')
            : t('product.generateSummary')}
        </Button>
      </div>
      </LiquidSurface>
        {templates.isError && (
          <div role="alert" className="text-sm">
            <p>{t('product.summaryTemplateMissing')}</p>
            <Button variant="ghost" onClick={() => templates.refetch()}>
              {t('product.retry')}
            </Button>
          </div>
        )}
        {generate.isPending && (
          <p className="text-sm text-muted-foreground" role="status">
            {t('product.summaryStatus')}
          </p>
        )}
        {status && <p
          role={generate.isError ? 'alert' : 'status'}
          className="product-inline-status break-words"
        >
          {status}
        </p>}
      </div>
      <div className="summary-library-content">
      {isError ? (
        <div role="alert">
          <p>{t('common.error')}</p>
          <Button variant="ghost" onClick={() => refetch()}>
            {t('product.retry')}
          </Button>
        </div>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : summaries.length === 0 ? (
        <EmptyState
          icon={AlignLeft}
          title={t('product.noSummaries')}
          description={t('product.noSummariesDesc')}
        />
      ) : (
        <div className="study-library-list grid gap-2">
          {summaries.map((note) => (
            <button
              key={note.id}
              data-record-id={note.id}
              className="summary-record min-h-14 p-4 text-left"
              onClick={() => setEditing(note)}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <AlignLeft className="size-4 text-teal shrink-0" />
                <span className="break-words">
                  {note.title || t('common.untitled')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      </div>
      <NoteEditorDialog
        notebookId={notebookId}
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(undefined)}
        note={editing}
      />
    </div>
  )
}
