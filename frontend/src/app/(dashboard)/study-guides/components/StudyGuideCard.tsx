'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { CalendarClock, Layers, Route, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LiquidSurface } from '@/components/layout/LiquidSurface'
import { notebookAccent } from '@/app/(dashboard)/notebooks/components/NotebookCard'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { StudyGuide } from '@/lib/types/study-guides'
import { daysBetween, localToday, progressPercent } from '@/lib/utils/study-guide'
import { GOAL_LABELS } from '@/lib/utils/study-guide-labels'

interface StudyGuideCardProps {
  guide: StudyGuide
  notebookName?: string
  index?: number
  onDelete: () => void
}

export function StudyGuideCard({ guide, notebookName, index = 0, onDelete }: StudyGuideCardProps) {
  const { t } = useTranslation()
  const percent = progressPercent(guide)
  const today = localToday()
  const examIn = guide.exam_date ? daysBetween(today, guide.exam_date) : null
  return (
    <article
      data-record-id={guide.id}
      className="notebook-tile exam-tile group"
      style={{ '--nb-accent': notebookAccent(guide.notebook_id), '--nb-delay': `${Math.min(index, 8) * 55}ms`, '--nb-phase': `${-(index * 3.7) % 14}s` } as CSSProperties}
    >
      <span className="notebook-tile-halo" aria-hidden="true" />
      <span className="notebook-tile-halo notebook-tile-halo-alt" aria-hidden="true" />
      <LiquidSurface className="notebook-tile-glass" radius={26}>
        <div className="notebook-tile-body">
          <div className="flex items-start gap-3">
            <span className="notebook-tile-mark exam-tile-score" title={t('studyGuides.progressPercent', { percent })}>
              {guide.completed_count > 0 ? (
                <>
                  <span aria-hidden="true">{percent}%</span>
                  <span className="sr-only">{t('studyGuides.progressPercent', { percent })}</span>
                </>
              ) : (
                <Route className="size-5" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h3 className="notebook-tile-title">
                <Link
                  href={`/study-guides/${encodeURIComponent(guide.id)}`}
                  className="after:absolute after:inset-0 after:rounded-[26px]"
                  title={guide.title}
                >
                  {guide.title}
                </Link>
              </h3>
              <p className="notebook-tile-description truncate">{notebookName ?? guide.notebook_id}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="relative z-10 -mr-2 -mt-1 size-10 rounded-full"
              aria-label={t('studyGuides.deleteNamed', { title: guide.title })}
              title={t('studyGuides.deleteNamed', { title: guide.title })}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="notebook-tile-footer">
            <span className="notebook-tile-chip">{t(GOAL_LABELS[guide.goal])}</span>
            <span className="notebook-tile-chip" title={t('studyGuides.topicCount', { n: guide.topic_count })}>
              {t('studyGuides.topicCount', { n: guide.topic_count })}
            </span>
            {guide.due_card_count > 0 && (
              <span className="notebook-tile-chip" title={t('studyGuides.dueCards', { n: guide.due_card_count })}>
                <Layers className="size-3.5" aria-hidden="true" />
                <span aria-hidden="true">{guide.due_card_count}</span>
                <span className="sr-only">{t('studyGuides.dueCards', { n: guide.due_card_count })}</span>
              </span>
            )}
            {examIn != null && examIn >= 0 && (
              <span className="notebook-tile-time inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" aria-hidden="true" />
                {examIn === 0 ? t('studyGuides.examToday') : t('studyGuides.examInDays', { n: examIn })}
              </span>
            )}
          </div>
        </div>
      </LiquidSurface>
    </article>
  )
}
