'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlignLeft, ArrowUpRight } from 'lucide-react'
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

export function SummaryLibrary({ notebookId }: { notebookId: string }) {
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
    <div className="grid gap-4">
      <div className="grid gap-3">
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
        <p
          role={generate.isError ? 'alert' : 'status'}
          className="product-inline-status break-words"
        >
          {status}
        </p>
      </div>
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
        <div className="grid gap-2">
          {summaries.map((note) => (
            <button
              key={note.id}
              className="min-h-14 rounded-xl border bg-card p-4 text-left hover:bg-accent"
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
      <Link
        className="product-link text-sm"
        href={`/notebooks/${encodeURIComponent(notebookId)}?tab=chat`}
      >
        {t('product.openChat')}
        <ArrowUpRight className="size-4" />
      </Link>
      <NoteEditorDialog
        notebookId={notebookId}
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(undefined)}
        note={editing}
      />
    </div>
  )
}
