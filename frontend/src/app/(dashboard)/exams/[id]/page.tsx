'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { ArrowLeft, Loader2, RotateCcw, Send, Trash2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ListSkeleton, LoadError } from '@/components/common/LoadingSkeletons'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import {
  useDeleteExamAttempt,
  useExam,
  useExamAttempts,
  useSubmitExamAttempt,
} from '@/lib/hooks/use-exams'
import { hasOpenAnswer } from '@/lib/utils/exam-answers'
import { loadExamDraft, safeReturnPath, saveExamDraft } from '@/lib/utils/exam-navigation'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { ExamAnswer, ExamAnswers, ExamAttempt, ExamQuestion } from '@/lib/types/exams'
import { QuestionInput } from '../components/QuestionInput'
import { ExamQuestionImages } from '../components/ExamQuestionImages'
import { ExamResults } from '../components/ExamResults'

function isAnswered(question: ExamQuestion, answer: ExamAnswer | undefined) {
  if (question.type === 'multiple_choice') return typeof answer === 'number'
  if (question.type === 'multiple_select') return Array.isArray(answer) && answer.length > 0
  if (question.type === 'fill_blank') return Array.isArray(answer) && answer.some((a) => String(a).trim())
  return hasOpenAnswer(answer)
}

const questionAnchor = (id: string) => `question-${id}`

function QuestionNavigator({
  questions,
  answers,
  className,
}: {
  questions: ExamQuestion[]
  answers: ExamAnswers
  className?: string
}) {
  const { t } = useTranslation()
  const jump = (id: string) => {
    const target = document.getElementById(questionAnchor(id))
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    target?.focus({ preventScroll: true })
  }
  return (
    <nav aria-label={t('exams.questionNavigation')} className={className}>
      <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
        {questions.map((question, index) => {
          const done = isAnswered(question, answers[question.id])
          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => jump(question.id)}
                aria-label={t('exams.questionStatus', {
                  n: index + 1,
                  status: t(done ? 'exams.answered' : 'exams.unanswered'),
                })}
                className={cn(
                  'grid size-10 place-items-center rounded-full border text-sm tabular-nums transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  done ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
                )}
              >
                {index + 1}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function ExamPageContent() {
  const { t } = useTranslation()
  const params = useParams()
  const searchParams = useSearchParams()
  const examId = params?.id ? decodeURIComponent(params.id as string) : ''
  const returnPath = safeReturnPath(searchParams?.get('from'))

  const [answers, setAnswers] = useState<ExamAnswers>({})
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [viewedAttempt, setViewedAttempt] = useState<ExamAttempt | null>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [attemptToDelete, setAttemptToDelete] = useState<ExamAttempt | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const { data: exam, isLoading } = useExam(examId)
  // The answer key is only fetched once results are shown.
  const { data: examWithAnswers } = useExam(viewedAttempt ? examId : '', true)
  const { data: attempts = [], isLoading: attemptsLoading, isError: attemptsError, refetch: refetchAttempts } = useExamAttempts(examId)
  const submitAttempt = useSubmitExamAttempt(examId)
  const deleteAttempt = useDeleteExamAttempt(examId)

  useEffect(() => {
    if (!examId) return
    setAnswers(loadExamDraft(examId))
    setDraftLoaded(true)
  }, [examId])

  useEffect(() => {
    if (draftLoaded) saveExamDraft(examId, answers)
  }, [answers, draftLoaded, examId])

  // Switching between answering and a result starts at the top, with focus
  // on the title, instead of leaving the reader next to the submit bar.
  const showTop = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: 0 })
      headingRef.current?.focus({ preventScroll: true })
    })
  }

  const back = returnPath ?? '/exams'
  const backLabel = back.startsWith('/notebooks') ? t('exams.backToNotebook') : t('exams.backToExams')

  if (isLoading) {
    return (
      <AppShell>
        <div className="product-page">
          <ListSkeleton rows={5} />
        </div>
      </AppShell>
    )
  }

  if (!exam) {
    return (
      <AppShell>
        <div className="product-page">
          <h1 className="font-display text-2xl font-medium tracking-tight">{t('exams.notFound')}</h1>
          <Button asChild variant="outline" className="self-start">
            <Link href={back}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              {backLabel}
            </Link>
          </Button>
        </div>
      </AppShell>
    )
  }

  const questions = exam.questions ?? []
  const answeredCount = questions.filter((q) => isAnswered(q, answers[q.id])).length
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0

  const submit = async () => {
    setConfirmSubmit(false)
    try {
      setViewedAttempt(await submitAttempt.mutateAsync(answers))
      setAnswers({})
      showTop()
    } catch {
      // Error toast is shown by the mutation hook
    }
  }

  const retake = () => {
    setAnswers({})
    setViewedAttempt(null)
    showTop()
  }

  const viewAttempt = (attempt: ExamAttempt) => {
    setViewedAttempt(attempt)
    showTop()
  }

  const attemptPercent = (attempt: ExamAttempt) =>
    attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0

  return (
    <AppShell>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6 min-w-0">
            <div className="space-y-3">
              <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-11">
                <Link href={back}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  {backLabel}
                </Link>
              </Button>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-2xl font-medium tracking-tight outline-none"
              >
                {exam.title}
              </h1>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{t('exams.questionCount', { n: exam.question_count })}</Badge>
                <Badge variant="outline">{t(`exams.difficulties.${exam.difficulty}`)}</Badge>
                <Badge variant="outline">{t('exams.maxScore', { points: exam.max_score })}</Badge>
              </div>
              {!viewedAttempt && questions.length > 1 && (
                <QuestionNavigator questions={questions} answers={answers} className="lg:hidden" />
              )}
            </div>

            {viewedAttempt ? (
              <>
                <ExamResults attempt={viewedAttempt} questions={examWithAnswers?.questions ?? questions} images={examWithAnswers?.images ?? exam.images} />
                <div className="flex flex-wrap gap-3">
                  <Button onClick={retake}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {t('exams.retake')}
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={back}>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      {backLabel}
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
                {questions.map((question, index) => {
                  const headingId = `${questionAnchor(question.id)}-title`
                  return (
                    <Card
                      key={question.id}
                      id={questionAnchor(question.id)}
                      tabIndex={-1}
                      role="group"
                      aria-labelledby={headingId}
                      className="scroll-mt-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <h2 id={headingId} className="font-medium">{t('exams.questionN', { n: index + 1 })}</h2>
                          <Badge variant="outline">{t(`exams.types.${question.type}`)}</Badge>
                          <span className="ml-auto">{t('exams.points', { n: question.points })}</span>
                        </div>
                        {question.type !== 'fill_blank' && (
                          <CardTitle className="text-base font-medium leading-snug whitespace-pre-wrap">
                            {question.prompt}
                          </CardTitle>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <ExamQuestionImages question={question} images={exam.images} />
                        <QuestionInput
                          question={question}
                          value={answers[question.id]}
                          disabled={submitAttempt.isPending}
                          onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
                        />
                      </CardContent>
                    </Card>
                  )
                })}

                <div className="exam-submit-bar sticky bottom-3 z-20 px-4 py-3 space-y-3">
                  <Progress
                    value={progress}
                    aria-label={t('exams.answeredProgress', { answered: answeredCount, total: questions.length })}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-muted-foreground" aria-live="polite">
                      {submitAttempt.isPending
                        ? t('exams.gradingHint')
                        : t('exams.answeredProgress', { answered: answeredCount, total: questions.length })}
                    </p>
                    <Button
                      className="ml-auto min-h-11"
                      disabled={submitAttempt.isPending}
                      onClick={() => (answeredCount < questions.length ? setConfirmSubmit(true) : submit())}
                    >
                      {submitAttempt.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      {submitAttempt.isPending ? t('exams.grading') : t('exams.submit')}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            {!viewedAttempt && questions.length > 1 && (
              <QuestionNavigator questions={questions} answers={answers} className="hidden lg:block" />
            )}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t('exams.attempts')}
              </h2>
              {attemptsLoading ? <ListSkeleton rows={2} /> : attemptsError ? <LoadError onRetry={() => refetchAttempts()} className="py-4" /> : attempts.length === 0 && <p className="text-sm text-muted-foreground">{t('exams.noAttempts')}</p>}
              {attempts.length > 0 && (
                <ul className="space-y-2">
                  {attempts.map((attempt) => {
                    const percent = attemptPercent(attempt)
                    const date = new Date(attempt.created).toLocaleString()
                    const current = viewedAttempt?.id === attempt.id
                    return (
                      <li
                        data-record-id={attempt.id}
                        key={attempt.id}
                        data-current={current || undefined}
                        className="exam-attempt flex items-center gap-2 p-1 pl-3 text-sm"
                      >
                        <button
                          type="button"
                          className="flex-1 min-h-11 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-current={current ? 'true' : undefined}
                          aria-label={t('exams.viewAttempt', { date, percent })}
                          onClick={() => viewAttempt(attempt)}
                        >
                          <span className="font-semibold">{percent}%</span>
                          <span className="block text-xs text-muted-foreground">{date}</span>
                        </button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-11"
                          aria-label={t('exams.deleteAttempt')}
                          title={t('exams.deleteAttempt')}
                          onClick={() => setAttemptToDelete(attempt)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title={t('exams.submitIncompleteTitle')}
        description={t('exams.submitIncompleteDesc', { n: questions.length - answeredCount })}
        confirmText={t('exams.submit')}
        onConfirm={submit}
      />

      <ConfirmDialog
        open={!!attemptToDelete}
        onOpenChange={(open) => !open && setAttemptToDelete(null)}
        title={t('exams.deleteAttempt')}
        description={t('exams.deleteAttemptDesc', {
          date: attemptToDelete ? new Date(attemptToDelete.created).toLocaleString() : '',
          percent: attemptToDelete ? attemptPercent(attemptToDelete) : 0,
        })}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        isLoading={deleteAttempt.isPending}
        onConfirm={() => {
          const attempt = attemptToDelete
          if (!attempt) return
          deleteAttempt.mutate(attempt.id, {
            onSuccess: () => {
              if (viewedAttempt?.id === attempt.id) setViewedAttempt(null)
            },
            onSettled: () => setAttemptToDelete(null),
          })
        }}
      />
    </AppShell>
  )
}

export default function ExamPage() {
  return (
    <Suspense>
      <ExamPageContent />
    </Suspense>
  )
}
