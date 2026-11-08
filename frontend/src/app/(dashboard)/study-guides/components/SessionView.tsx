'use client'

import { useState } from 'react'
import { ChevronDown, Clock } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type { StudyGuide, StudySession, StudyTopic } from '@/lib/types/study-guides'
import { parsePlanDate } from '@/lib/utils/study-guide'
import { ActivityMaterial } from './ActivityMaterial'
import { ACTIVITY_LABELS, ACTIVITY_STRATEGY, CONFIDENCE_LABELS, STRATEGY_LABELS } from '@/lib/utils/study-guide-labels'

const CONFIDENCE = [1, 2, 3, 4, 5]

export function ConfidenceRating({
  topic,
  value,
  onChange,
  disabled,
}: {
  topic: StudyTopic
  value?: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm min-w-0 flex-1">{topic.title}</span>
      <div role="radiogroup" aria-label={t('studyGuides.confidenceFor', { topic: topic.title })} className="flex gap-1">
        {CONFIDENCE.map((level) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={value === level}
            title={t(CONFIDENCE_LABELS[level])}
            disabled={disabled}
            onClick={() => onChange(level)}
            className={cn(
              'size-9 rounded-full border text-sm tabular-nums',
              value === level ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'
            )}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  )
}

interface SessionViewProps {
  guide: StudyGuide
  session: StudySession
  topicsById: Record<string, StudyTopic>
  busy: boolean
  onToggle: (activityId: string, done: boolean) => void
  onConfidence: (topicId: string, value: number) => void
  onOpenFlashcards: () => void
  onPracticeExam: (topics: StudyTopic[]) => void
  defaultOpen?: boolean
}

export function SessionView({
  guide,
  session,
  topicsById,
  busy,
  onToggle,
  onConfidence,
  onOpenFlashcards,
  onPracticeExam,
  defaultOpen = false,
}: SessionViewProps) {
  const { t, language } = useTranslation()
  const completed = new Set(guide.completed_activities ?? [])
  const [open, setOpen] = useState<string | null>(
    defaultOpen ? (session.activities.find((a) => !completed.has(a.id))?.id ?? null) : null
  )
  const studied = [
    ...new Set(
      session.activities
        .filter((a) => a.type === 'learn' || a.type === 'self_explain')
        .flatMap((a) => a.topic_ids)
    ),
  ]
    .map((id) => topicsById[id])
    .filter(Boolean)

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Clock className="size-4" aria-hidden="true" />
        {parsePlanDate(session.date).toLocaleDateString(language, { weekday: 'long', day: 'numeric', month: 'long' })}
        {' · '}
        {t('studyGuides.minutes', { n: session.minutes })}
      </p>
      <ul className="space-y-2">
        {session.activities.map((activity) => {
          const done = completed.has(activity.id)
          const topics = activity.topic_ids.map((id) => topicsById[id]).filter(Boolean)
          const expanded = open === activity.id
          const panelId = `activity-${activity.id}`
          return (
            <li key={activity.id} className={cn('rounded-xl border bg-card', done && 'opacity-75')}>
              <div className="flex items-start gap-3 p-3">
                <Checkbox
                  className="mt-1"
                  checked={done}
                  disabled={busy}
                  aria-label={t('studyGuides.markDone', { activity: t(ACTIVITY_LABELS[activity.type].title) })}
                  onCheckedChange={(checked) => onToggle(activity.id, checked === true)}
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen(expanded ? null : activity.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('block font-medium', done && 'line-through')}>
                      {t(ACTIVITY_LABELS[activity.type].title)}
                    </span>
                    {topics.length > 0 && activity.type !== 'practice_exam' && activity.type !== 'pretest' && (
                      <span className="block truncate text-sm text-muted-foreground">
                        {topics.map((tp) => tp.title).join(' · ')}
                      </span>
                    )}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {t(STRATEGY_LABELS[ACTIVITY_STRATEGY[activity.type]].name)}
                  </Badge>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {t('studyGuides.minutesShort', { n: activity.minutes })}
                  </span>
                  <ChevronDown className={cn('mt-0.5 size-4 shrink-0 transition-transform', expanded && 'rotate-180')} />
                </button>
              </div>
              {expanded && (
                <div id={panelId} className="border-t px-4 py-3">
                  <ActivityMaterial
                    activity={activity}
                    topics={topics}
                    dueCardCount={guide.due_card_count}
                    onOpenFlashcards={onOpenFlashcards}
                    onPracticeExam={onPracticeExam}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {studied.length > 0 && (
        <div className="space-y-2 rounded-xl border border-dashed p-3">
          <p className="text-sm font-medium">{t('studyGuides.confidenceQuestion')}</p>
          <p className="text-xs text-muted-foreground">{t('studyGuides.confidenceHint')}</p>
          {studied.map((topic) => (
            <ConfidenceRating
              key={topic.id}
              topic={topic}
              value={guide.topic_confidence?.[topic.id]}
              disabled={busy}
              onChange={(value) => onConfidence(topic.id, value)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
