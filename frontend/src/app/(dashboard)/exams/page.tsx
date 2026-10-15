'use client'

import { Suspense, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, GraduationCap, Plus, Trash2, Play } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/common/EmptyState'
import { CardGridSkeleton, LoadError } from '@/components/common/LoadingSkeletons'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { useExams, useDeleteExam } from '@/lib/hooks/use-exams'
import { useNotebooks } from '@/lib/hooks/use-notebooks'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Exam } from '@/lib/types/exams'
import { examHref, examListHref } from '@/lib/utils/exam-navigation'
import { CreateExamDialog } from './components/CreateExamDialog'

const ALL_NOTEBOOKS = '__all__'

function ExamsPageContent() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const notebookParam = searchParams?.get('notebook') ?? undefined
  // The filter lives in the URL, so coming back from an exam keeps it.
  const notebookFilter = notebookParam ?? ALL_NOTEBOOKS
  const listHref = examListHref(notebookParam)

  const setNotebookFilter = (value: string) =>
    router.replace(examListHref(value === ALL_NOTEBOOKS ? undefined : value), { scroll: false })
  const [createOpen, setCreateOpen] = useState(!!notebookParam && searchParams?.get('new') === '1')
  const changeCreateOpen = (open: boolean) => {
    setCreateOpen(open)
    // Drop ?new=1 so going back to this list does not reopen the dialog.
    if (!open && searchParams?.get('new')) router.replace(listHref, { scroll: false })
  }
  const [examToDelete, setExamToDelete] = useState<Exam | null>(null)

  const { data: exams = [], isLoading, isError, refetch } = useExams(
    notebookFilter === ALL_NOTEBOOKS ? undefined : notebookFilter
  )
  const { data: notebooks = [] } = useNotebooks()
  const deleteExam = useDeleteExam()

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
              <h1 className="font-display text-2xl font-medium tracking-tight">{t('exams.title')}</h1>
              <p className="text-muted-foreground mt-1 max-w-3xl">{t('exams.desc')}</p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('exams.newExam')}
            </Button>
          </div>

          <div className="max-w-xs">
            <Select value={notebookFilter} onValueChange={setNotebookFilter}>
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
          </div>

          {isLoading ? (
            <CardGridSkeleton count={4} />
          ) : isError ? (
            <LoadError onRetry={() => refetch()} />
          ) : exams.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title={t('exams.emptyTitle')}
              description={t('exams.emptyDesc')}
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('exams.newExam')}
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {exams.map((exam) => {
                const best =
                  exam.best_score != null && exam.max_score > 0
                    ? Math.round((exam.best_score / exam.max_score) * 100)
                    : null
                return (
                  <Card data-record-id={exam.id} key={exam.id} className="flex flex-col">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base leading-snug">{exam.title}</CardTitle>
                      <p className="text-xs text-muted-foreground truncate">
                        {notebookNames[exam.notebook_id] ?? exam.notebook_id}
                      </p>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {t('exams.questionCount', { n: exam.question_count })}
                        </Badge>
                        <Badge variant="outline">{t(`exams.difficulties.${exam.difficulty}`)}</Badge>
                        {best != null && (
                          <Badge>{t('exams.bestScore', { percent: best })}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('exams.attemptCount', { n: exam.attempt_count })} ·{' '}
                        {new Date(exam.created).toLocaleDateString()}
                      </p>
                      <div className="mt-auto flex gap-2">
                        <Button asChild size="sm" className="flex-1 min-h-11">
                          <Link
                            href={examHref(exam.id, listHref)}
                            aria-label={t('exams.openNamed', { title: exam.title })}
                          >
                            <Play className="h-4 w-4 mr-2" />
                            {t('exams.open')}
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          className="size-11"
                          aria-label={t('exams.deleteExamNamed', { title: exam.title })}
                          title={t('exams.deleteExamNamed', { title: exam.title })}
                          onClick={() => setExamToDelete(exam)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <CreateExamDialog
        open={createOpen}
        onOpenChange={changeCreateOpen}
        initialNotebookId={notebookFilter === ALL_NOTEBOOKS ? undefined : notebookFilter}
      />

      <ConfirmDialog
        open={!!examToDelete}
        onOpenChange={(open) => !open && setExamToDelete(null)}
        title={t('exams.deleteExam')}
        description={t('exams.deleteExamDesc', { title: examToDelete?.title ?? '' })}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        isLoading={deleteExam.isPending}
        onConfirm={() => {
          if (examToDelete) {
            deleteExam.mutate(examToDelete.id, { onSettled: () => setExamToDelete(null) })
          }
        }}
      />
    </AppShell>
  )
}

export default function ExamsPage() {
  return (
    <Suspense>
      <ExamsPageContent />
    </Suspense>
  )
}
