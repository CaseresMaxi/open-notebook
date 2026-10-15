'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { GraduationCap, ListChecks, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LiquidSurface } from '@/components/layout/LiquidSurface'
import { notebookAccent } from '@/app/(dashboard)/notebooks/components/NotebookCard'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getDateLocale } from '@/lib/utils/date-locale'
import type { Exam } from '@/lib/types/exams'

interface ExamCardProps {
  exam: Exam
  href: string
  notebookName?: string
  index?: number
  onDelete: () => void
}

/** Same liquid glass tile as notebooks, tinted by the exam's notebook. */
export function ExamCard({ exam, href, notebookName, index = 0, onDelete }: ExamCardProps) {
  const { t, language } = useTranslation()
  const best = exam.best_score != null && exam.max_score > 0
    ? Math.round((exam.best_score / exam.max_score) * 100)
    : null
  const created = new Date(exam.created)
  return (
    <article
      data-record-id={exam.id}
      className="notebook-tile exam-tile group"
      style={{ '--nb-accent': notebookAccent(exam.notebook_id), '--nb-delay': `${Math.min(index, 8) * 55}ms`, '--nb-phase': `${-(index * 3.7) % 14}s` } as CSSProperties}
    >
      <span className="notebook-tile-halo" aria-hidden="true" />
      <span className="notebook-tile-halo notebook-tile-halo-alt" aria-hidden="true" />
      <LiquidSurface className="notebook-tile-glass" radius={26}>
        <div className="notebook-tile-body">
          <div className="flex items-start gap-3">
            <span className="notebook-tile-mark exam-tile-score" title={best != null ? t('exams.bestScore', { percent: best }) : undefined}>
              {best != null ? (
                <>
                  <span aria-hidden="true">{best}%</span>
                  <span className="sr-only">{t('exams.bestScore', { percent: best })}</span>
                </>
              ) : (
                <GraduationCap className="size-5" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className="notebook-tile-title">
                <Link
                  href={href}
                  className="after:absolute after:inset-0 after:rounded-[26px]"
                  title={exam.title}
                >
                  {exam.title}
                </Link>
              </h3>
              <p className="notebook-tile-description truncate">{notebookName ?? exam.notebook_id}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="relative z-10 -mr-2 -mt-1 size-10 rounded-full"
              aria-label={t('exams.deleteExamNamed', { title: exam.title })}
              title={t('exams.deleteExamNamed', { title: exam.title })}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="notebook-tile-footer">
            <span className="notebook-tile-chip" title={t('exams.questionCount', { n: exam.question_count })}>
              <ListChecks className="size-3.5" aria-hidden="true" />
              <span aria-hidden="true">{exam.question_count}</span>
              <span className="sr-only">{t('exams.questionCount', { n: exam.question_count })}</span>
            </span>
            <span className="notebook-tile-chip">{t(`exams.difficulties.${exam.difficulty}`)}</span>
            <span className="notebook-tile-chip" title={t('exams.attemptCount', { n: exam.attempt_count })}>
              <RotateCcw className="size-3.5" aria-hidden="true" />
              <span aria-hidden="true">{exam.attempt_count}</span>
              <span className="sr-only">{t('exams.attemptCount', { n: exam.attempt_count })}</span>
            </span>
            {!Number.isNaN(created.getTime()) && (
              <time className="notebook-tile-time" dateTime={exam.created} title={created.toLocaleString(language)}>
                {formatDistanceToNow(created, { addSuffix: true, locale: getDateLocale(language) })}
              </time>
            )}
          </div>
        </div>
      </LiquidSurface>
    </article>
  )
}
