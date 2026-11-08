'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, Route } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { LiquidSurface } from '@/components/layout/LiquidSurface'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/common/EmptyState'
import { CardGridSkeleton, LoadError } from '@/components/common/LoadingSkeletons'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useDeleteStudyGuide, useStudyGuides } from '@/lib/hooks/use-study-guides'
import { useNotebooks } from '@/lib/hooks/use-notebooks'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { StudyGuide } from '@/lib/types/study-guides'
import { CreateStudyGuideDialog } from './components/CreateStudyGuideDialog'
import { StudyGuideCard } from './components/StudyGuideCard'

const ALL_NOTEBOOKS = '__all__'

function listHref(notebookId?: string) {
  return notebookId ? `/study-guides?notebook=${encodeURIComponent(notebookId)}` : '/study-guides'
}

function StudyGuidesPageContent() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const notebookParam = searchParams?.get('notebook') ?? undefined
  const notebookFilter = notebookParam ?? ALL_NOTEBOOKS
  const [createOpen, setCreateOpen] = useState(!!notebookParam && searchParams?.get('new') === '1')
  const [toDelete, setToDelete] = useState<StudyGuide | null>(null)

  const changeCreateOpen = (open: boolean) => {
    setCreateOpen(open)
    if (!open && searchParams?.get('new')) router.replace(listHref(notebookParam), { scroll: false })
  }

  const { data: guides = [], isLoading, isError, refetch } = useStudyGuides(
    notebookFilter === ALL_NOTEBOOKS ? undefined : notebookFilter
  )
  const { data: notebooks = [] } = useNotebooks()
  const deleteGuide = useDeleteStudyGuide()
  const notebookNames = useMemo(
    () => Object.fromEntries(notebooks.map((nb) => [nb.id, nb.name])),
    [notebooks]
  )

  return (
    <AppShell>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="product-page">
          {notebookParam && notebookNames[notebookParam] && (
            <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-11 self-start">
              <Link href={`/notebooks/${encodeURIComponent(notebookParam)}`}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                {t('exams.backToNotebookNamed', { name: notebookNames[notebookParam] })}
              </Link>
            </Button>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-medium tracking-tight">{t('studyGuides.title')}</h1>
              <p className="text-muted-foreground mt-1 max-w-3xl">{t('studyGuides.desc')}</p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('studyGuides.newGuide')}
            </Button>
          </div>

          <LiquidSurface className="exam-filter" radius={16}>
            <Select
              value={notebookFilter}
              onValueChange={(value) =>
                router.replace(listHref(value === ALL_NOTEBOOKS ? undefined : value), { scroll: false })
              }
            >
              <SelectTrigger aria-label={t('exams.filterByNotebook')} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_NOTEBOOKS}>{t('exams.allNotebooks')}</SelectItem>
                {notebooks.map((nb) => (
                  <SelectItem key={nb.id} value={nb.id}>
                    {nb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LiquidSurface>

          {isLoading ? (
            <CardGridSkeleton count={4} />
          ) : isError ? (
            <LoadError onRetry={() => refetch()} />
          ) : guides.length === 0 ? (
            <EmptyState
              icon={Route}
              title={t('studyGuides.emptyTitle')}
              description={t('studyGuides.emptyDesc')}
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('studyGuides.newGuide')}
                </Button>
              }
            />
          ) : (
            <div className="notebook-tiles exam-tiles">
              {guides.map((guide, index) => (
                <StudyGuideCard
                  key={guide.id}
                  guide={guide}
                  index={index}
                  notebookName={notebookNames[guide.notebook_id]}
                  onDelete={() => setToDelete(guide)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateStudyGuideDialog
        open={createOpen}
        onOpenChange={changeCreateOpen}
        initialNotebookId={notebookFilter === ALL_NOTEBOOKS ? undefined : notebookFilter}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t('studyGuides.delete')}
        description={t('studyGuides.deleteDesc', { title: toDelete?.title ?? '' })}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        isLoading={deleteGuide.isPending}
        onConfirm={() => {
          if (toDelete) deleteGuide.mutate(toDelete.id, { onSettled: () => setToDelete(null) })
        }}
      />
    </AppShell>
  )
}

export default function StudyGuidesPage() {
  return (
    <Suspense>
      <StudyGuidesPageContent />
    </Suspense>
  )
}
