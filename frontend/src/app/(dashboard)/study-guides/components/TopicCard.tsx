'use client'

import { useState } from 'react'
import { ChevronDown, GraduationCap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type { StudyTopic, TopicStats } from '@/lib/types/study-guides'
import { calibration } from '@/lib/utils/study-guide'
import { QuestionList } from './ActivityMaterial'
import { ConfidenceRating } from './SessionView'
import { CALIBRATION_LABELS, DIFFICULTY_LABELS } from '@/lib/utils/study-guide-labels'

interface TopicCardProps {
  topic: StudyTopic
  index: number
  stats?: TopicStats
  confidence?: number
  prerequisites: StudyTopic[]
  sourceTitles: Record<string, string>
  busy: boolean
  onConfidence: (value: number) => void
  onPracticeExam: () => void
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <section className="space-y-1.5">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

export function TopicCard({
  topic,
  index,
  stats,
  confidence,
  prerequisites,
  sourceTitles,
  busy,
  onConfidence,
  onPracticeExam,
}: TopicCardProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const mastery = stats && stats.cards ? Math.round((stats.mastered / stats.cards) * 100) : 0
  const calibrated = calibration(confidence, stats?.recall_rate, stats?.reviews ?? 0)
  const panelId = `topic-${topic.id}`
  return (
    <article className="rounded-2xl border bg-card">
      <button
        type="button"
        className="flex w-full items-start gap-3 p-4 text-left"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fern-tint text-sm font-medium tabular-nums">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block font-medium">{topic.title}</span>
          {topic.summary && <span className="block text-sm text-muted-foreground">{topic.summary}</span>}
          <span className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant="outline">{t(DIFFICULTY_LABELS[topic.difficulty])}</Badge>
            {topic.importance >= 3 && <Badge variant="secondary">{t('studyGuides.core')}</Badge>}
            {stats && stats.cards > 0 && (
              <Badge variant="outline">{t('studyGuides.mastery', { percent: mastery })}</Badge>
            )}
          </span>
        </span>
        <ChevronDown className={cn('mt-1 size-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div id={panelId} className="space-y-4 border-t p-4">
          {prerequisites.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('studyGuides.requires', { topics: prerequisites.map((p) => p.title).join(', ') })}
            </p>
          )}
          <List title={t('studyGuides.keyIdeas')} items={topic.key_ideas} />
          <List title={t('studyGuides.elaborationQuestions')} items={topic.elaboration_questions} />
          {topic.self_explanation_prompt && (
            <List title={t('studyGuides.selfExplanation')} items={[topic.self_explanation_prompt]} />
          )}
          <List title={t('studyGuides.examples')} items={topic.concrete_examples} />
          {topic.dual_coding_task && <List title={t('studyGuides.dualCoding')} items={[topic.dual_coding_task]} />}
          <List title={t('studyGuides.misconceptions')} items={topic.misconceptions} />
          {topic.practice_questions.length > 0 && (
            <section className="space-y-1.5">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('studyGuides.practiceQuestions')}
              </h4>
              <QuestionList questions={topic.practice_questions} />
            </section>
          )}
          {topic.source_ids.length > 0 && (
            <List
              title={t('studyGuides.sourcesForTopic')}
              items={topic.source_ids.map((id) => sourceTitles[id] ?? id)}
            />
          )}
          {stats && stats.cards > 0 && (
            <section className="space-y-1.5">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('studyGuides.cardProgress', { mastered: stats.mastered, total: stats.cards })}
              </h4>
              <Progress value={mastery} />
            </section>
          )}
          <ConfidenceRating topic={topic} value={confidence} disabled={busy} onChange={onConfidence} />
          {calibrated && calibrated !== 'calibrated' && (
            <p className="rounded-lg bg-warn-tint p-3 text-sm">{t(CALIBRATION_LABELS[calibrated])}</p>
          )}
          <Button variant="outline" size="sm" onClick={onPracticeExam}>
            <GraduationCap className="mr-2 size-4" />
            {t('studyGuides.examOnTopic')}
          </Button>
        </div>
      )}
    </article>
  )
}
