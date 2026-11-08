'use client'

import { useState } from 'react'
import { ChevronDown, GraduationCap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type { StudyGuide, StudyTopic, TopicStats } from '@/lib/types/study-guides'
import { calibration, responseKeys } from '@/lib/utils/study-guide'
import { AnsweredQuestions, ElaborationQuestions, Section, SourceLinks } from './ActivityMaterial'
import { AnswerBox } from './AnswerBox'
import { DualCodingSection } from './DualCodingSection'
import { ConfidenceRating } from './SessionView'
import { CALIBRATION_LABELS, DIFFICULTY_LABELS } from '@/lib/utils/study-guide-labels'

interface TopicCardProps {
  guide: StudyGuide
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
  guide,
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
          <SourceLinks topic={topic} sourceTitles={sourceTitles} />
          <List title={t('studyGuides.keyIdeas')} items={topic.key_ideas} />
          {topic.elaboration_questions.length > 0 && (
            <Section title={t('studyGuides.elaborationQuestions')}>
              <ElaborationQuestions guide={guide} topic={topic} context="topic" />
            </Section>
          )}
          <Section title={t('studyGuides.selfExplanation')}>
            {topic.self_explanation_prompt && <p className="text-sm">{topic.self_explanation_prompt}</p>}
            <AnswerBox
              guide={guide}
              responseKey={responseKeys.selfExplain(topic.id)}
              context="topic"
              reference={topic.key_ideas.join('\n')}
            />
          </Section>
          <List title={t('studyGuides.examples')} items={topic.concrete_examples} />
          <Section title={t('studyGuides.ownExample')}>
            <AnswerBox guide={guide} responseKey={responseKeys.example(topic.id)} context="topic" />
          </Section>
          {topic.dual_coding_task && <DualCodingSection guide={guide} topic={topic} context="topic" />}
          <List title={t('studyGuides.misconceptions')} items={topic.misconceptions} />
          {topic.practice_questions.length > 0 && (
            <Section title={t('studyGuides.practiceQuestions')}>
              <AnsweredQuestions
                guide={guide}
                context="topic"
                questions={topic.practice_questions.map((q, index) => ({ ...q, topicId: topic.id, index }))}
              />
            </Section>
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
