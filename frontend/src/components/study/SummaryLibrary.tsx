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
import { ListSkeleton } from '@/components/common/LoadingSkeletons'
import { useNotebookSources } from '@/lib/hooks/use-sources'
import { useNotes } from '@/lib/hooks/use-notes'
import { generateStudySummary, generateTopicSummary } from '@/lib/api/study'
import { transformationsApi } from '@/lib/api/transformations'
import { useTranslation } from '@/lib/hooks/use-translation'
import { isStudySummary, summaryContent } from '@/lib/utils/study-summary'
import { useModelDefaults } from '@/lib/hooks/use-models'
import { ListenButton } from '@/components/common/ListenButton'
import { Input } from '@/components/ui/input'
import axios from 'axios'
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
  const defaults = useModelDefaults()
  const [sourceId, setSourceId] = useState('')
  const [topic, setTopic] = useState('')
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
  const topicSummary = useMutation({
    retry: false,
    mutationFn: async (subject: string) => {
      const modelId = defaults.data?.default_chat_model
      if (!modelId) throw new Error(t('product.topicSummaryNoModel'))
      return generateTopicSummary({
        notebookId,
        modelId,
        question: t('product.topicSummaryInstructions', { topic: subject, language }),
        title: t('product.topicSummaryTitle', { topic: subject }),
        outputError: t('product.summaryFailed'),
      })
    },
    onSuccess: () => {
      setTopic('')
      client.invalidateQueries({ queryKey: ['notes'] })
      client.invalidateQueries({ queryKey: ['notebooks'] })
      setStatus(t('product.summarySaved'))
    },
    onError: (error) => {
      const detail = axios.isAxiosError(error) ? (error.response?.data as { detail?: string } | undefined)?.detail : undefined
      setStatus(detail || (error instanceof Error ? error.message : t('product.summaryFailed')))
    },
  })
  const busy = generate.isPending || topicSummary.isPending
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
          disabled={busy}
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
            busy ||
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
      <LiquidSurface className="summary-create-glass">
        <form
          className="summary-create-controls"
          onSubmit={(event) => {
            event.preventDefault()
            const subject = topic.trim()
            if (!subject || busy) return
            setStatus('')
            topicSummary.mutate(subject)
          }}
        >
          <Input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={t('product.topicPlaceholder')}
            aria-label={t('product.topicPlaceholder')}
            maxLength={200}
            disabled={busy}
            className="summary-topic-input min-h-11 flex-1"
          />
          <Button type="submit" variant="outline" disabled={!topic.trim() || busy || defaults.isLoading}>
            {topicSummary.isPending ? t('product.generatingSummary') : t('product.generateTopicSummary')}
          </Button>
        </form>
      </LiquidSurface>
        {templates.isError && (
          <div role="alert" className="text-sm">
            <p>{t('product.summaryTemplateMissing')}</p>
            <Button variant="ghost" onClick={() => templates.refetch()}>
              {t('product.retry')}
            </Button>
          </div>
        )}
        {busy && (
          <p className="text-sm text-muted-foreground" role="status">
            {topicSummary.isPending ? t('product.topicSummaryStatus') : t('product.summaryStatus')}
          </p>
        )}
        {status && <p
          role={generate.isError || topicSummary.isError ? 'alert' : 'status'}
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
        <ListSkeleton rows={3} />
      ) : summaries.length === 0 ? (
        <EmptyState
          icon={AlignLeft}
          title={t('product.noSummaries')}
          description={t('product.noSummariesDesc')}
        />
      ) : (
        <div className="study-library-list grid gap-2">
          {summaries.map((note) => (
            <div
              key={note.id}
              data-record-id={note.id}
              className="summary-record flex items-center gap-1 pr-2"
            >
              <button
                className="min-h-14 min-w-0 flex-1 p-4 text-left"
                onClick={() => setEditing(note)}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <AlignLeft className="size-4 text-teal shrink-0" />
                  <span className="break-words">
                    {note.title || t('common.untitled')}
                  </span>
                </span>
              </button>
              <ListenButton id={`summary:${note.id}`} text={summaryContent(note.content || '')} className="size-11 shrink-0 p-0" />
            </div>
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
