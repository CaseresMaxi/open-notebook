'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, StickyNote, Plus } from 'lucide-react'
import Link from 'next/link'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useNotebooks } from '@/lib/hooks/use-notebooks'
import { useNotes } from '@/lib/hooks/use-notes'
import { useTranslation } from '@/lib/hooks/use-translation'
import { NotesColumn } from '@/app/(dashboard)/notebooks/components/NotesColumn'
import { SummaryLibrary } from './SummaryLibrary'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'

export function NotebookLibrary({ mode }: { mode: 'notes' | 'summaries' }) {
  const { t } = useTranslation()
  const { openNotebookDialog } = useCreateDialogs()
  const {
    data: notebooks = [],
    isLoading,
    isError,
    refetch,
  } = useNotebooks(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const selected = searchParams?.get('notebook') ?? ''
  const setSelected = (id: string) =>
    router.replace(`/${mode}?notebook=${encodeURIComponent(id)}`, {
      scroll: false,
    })
  const notebookId = notebooks.some((nb) => nb.id === selected)
    ? selected
    : (notebooks[0]?.id ?? '')
  return (
    <AppShell>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="product-page">
          <div className="product-heading">
            <div>
              <h1>
                {t(mode === 'notes' ? 'common.notes' : 'product.summaries')}
              </h1>
              <p>
                {t(
                  mode === 'notes'
                    ? 'product.notesDesc'
                    : 'product.summariesDesc'
                )}
              </p>
            </div>
            <Select value={notebookId} onValueChange={setSelected}>
              <SelectTrigger
                className="w-full sm:w-72 min-h-11"
                aria-label={t('product.chooseNotebook')}
              >
                <SelectValue placeholder={t('product.chooseNotebook')} />
              </SelectTrigger>
              <SelectContent>
                {notebooks.map((nb) => (
                  <SelectItem key={nb.id} value={nb.id}>
                    {nb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isError ? (
            <div role="alert">
              <p>{t('common.error')}</p>
              <Button variant="outline" onClick={() => refetch()}>
                {t('product.retry')}
              </Button>
            </div>
          ) : isLoading ? (
            <LoadingSpinner />
          ) : !notebookId ? (
            <EmptyState
              icon={BookOpen}
              title={t('product.noNotebooks')}
              description={t('product.noNotebooksDesc')}
              action={
                <Button onClick={openNotebookDialog}>
                  <Plus className="size-4" />
                  {t('notebooks.newNotebook')}
                </Button>
              }
            />
          ) : mode === 'summaries' ? (
            <section className="product-panel max-w-3xl">
              <SummaryLibrary key={notebookId} notebookId={notebookId} />
            </section>
          ) : (
            <NotebookNotes key={notebookId} notebookId={notebookId} />
          )}
        </div>
      </div>
    </AppShell>
  )
}
function NotebookNotes({ notebookId }: { notebookId: string }) {
  const { t } = useTranslation()
  const { data: notes, isLoading, isError, refetch } = useNotes(notebookId)
  return (
    <div className="grid gap-4 max-w-4xl">
      <Link
        href={`/notebooks/${encodeURIComponent(notebookId)}`}
        className="product-link"
      >
        <StickyNote className="size-4" />
        {t('product.study')}
      </Link>
      {isError ? (
        <div role="alert">
          <p>{t('common.error')}</p>
          <Button variant="outline" onClick={() => refetch()}>
            {t('product.retry')}
          </Button>
        </div>
      ) : (
        <div className="min-h-96">
          <NotesColumn
            notes={notes}
            isLoading={isLoading}
            notebookId={notebookId}
            standalone
          />
        </div>
      )}
    </div>
  )
}
