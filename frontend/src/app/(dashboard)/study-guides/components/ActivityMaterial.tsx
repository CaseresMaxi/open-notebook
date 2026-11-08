'use client'

import Link from 'next/link'
import { FileText, GraduationCap, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { PracticeQuestion, StudyActivity, StudyGuide, StudyTopic } from '@/lib/types/study-guides'
import { responseKeys } from '@/lib/utils/study-guide'
import { ACTIVITY_LABELS } from '@/lib/utils/study-guide-labels'
import { AnswerBox } from './AnswerBox'

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  )
}

export function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

/** A practice question with its index in the topic, kept when interleaving. */
export interface TopicQuestion extends PracticeQuestion {
  topicId: string
  index: number
}

/** Mix questions of several topics so consecutive ones change topic. */
export function interleave(topics: StudyTopic[]): TopicQuestion[] {
  const queues = topics.map((topic) =>
    topic.practice_questions.map((q, index) => ({ ...q, topicId: topic.id, index }))
  )
  const mixed: TopicQuestion[] = []
  while (queues.some((q) => q.length)) {
    for (const queue of queues) {
      const next = queue.shift()
      if (next) mixed.push(next)
    }
  }
  return mixed
}

/** Numbered questions, each with its own stored answer. */
export function AnsweredQuestions({
  guide,
  questions,
  context,
}: {
  guide: StudyGuide
  questions: TopicQuestion[]
  context: string
}) {
  return (
    <ol className="list-decimal space-y-5 pl-5 text-sm">
      {questions.map((q) => (
        <li key={`${q.topicId}-${q.index}`} className="space-y-2">
          <p className="font-medium">{q.question}</p>
          <AnswerBox
            guide={guide}
            responseKey={responseKeys.practice(q.topicId, q.index)}
            context={context}
            reference={q.answer}
          />
        </li>
      ))}
    </ol>
  )
}

/** Why/how questions, each answered and analyzed by the AI. */
export function ElaborationQuestions({ guide, topic, context }: { guide: StudyGuide; topic: StudyTopic; context: string }) {
  return (
    <ol className="list-decimal space-y-5 pl-5 text-sm">
      {topic.elaboration_questions.map((question, index) => (
        <li key={index} className="space-y-2">
          <p className="font-medium">{question}</p>
          <AnswerBox guide={guide} responseKey={responseKeys.elaboration(topic.id, index)} context={context} />
        </li>
      ))}
    </ol>
  )
}

export function SourceLinks({ topic, sourceTitles }: { topic: StudyTopic; sourceTitles: Record<string, string> }) {
  const { t } = useTranslation()
  if (!topic.source_ids.length) return null
  return (
    <Section title={t('studyGuides.sourcesForTopic')}>
      <ul className="flex flex-wrap gap-2">
        {topic.source_ids.map((id) => (
          <li key={id}>
            <Button asChild variant="outline" size="sm">
              <Link href={`/sources/${encodeURIComponent(id)}`}>
                <FileText className="mr-1.5 size-3.5" />
                {sourceTitles[id] ?? t('exams.untitledSource')}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  )
}

interface ActivityMaterialProps {
  guide: StudyGuide
  activity: StudyActivity
  topics: StudyTopic[]
  sourceTitles: Record<string, string>
  onOpenFlashcards: () => void
  onPracticeExam: (topics: StudyTopic[]) => void
}

/** What to do in an activity, with an answer box for everything it asks. */
export function ActivityMaterial({
  guide,
  activity,
  topics,
  sourceTitles,
  onOpenFlashcards,
  onPracticeExam,
}: ActivityMaterialProps) {
  const { t } = useTranslation()
  const topic = topics[0]
  const context = activity.id

  switch (activity.type) {
    case 'pretest':
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t(ACTIVITY_LABELS.pretest.how)}</p>
          {topics.map((tp) => (
            <Section key={tp.id} title={tp.title}>
              <AnsweredQuestions
                guide={guide}
                context={context}
                questions={tp.practice_questions.slice(0, 2).map((q, index) => ({ ...q, topicId: tp.id, index }))}
              />
            </Section>
          ))}
        </div>
      )
    case 'learn':
      if (!topic) return null
      return (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">{t(ACTIVITY_LABELS.learn.how)}</p>
          {topic.summary && <p className="text-sm">{topic.summary}</p>}
          <SourceLinks topic={topic} sourceTitles={sourceTitles} />
          {topic.key_ideas.length > 0 && (
            <Section title={t('studyGuides.keyIdeas')}>
              <Bullets items={topic.key_ideas} />
            </Section>
          )}
          {topic.elaboration_questions.length > 0 && (
            <Section title={t('studyGuides.elaborationQuestions')}>
              <ElaborationQuestions guide={guide} topic={topic} context={context} />
            </Section>
          )}
          {topic.concrete_examples.length > 0 && (
            <Section title={t('studyGuides.examples')}>
              <Bullets items={topic.concrete_examples} />
            </Section>
          )}
          <Section title={t('studyGuides.ownExample')}>
            <AnswerBox guide={guide} responseKey={responseKeys.example(topic.id)} context={context} />
          </Section>
          {topic.dual_coding_task && (
            <Section title={t('studyGuides.dualCoding')}>
              <p className="text-sm">{topic.dual_coding_task}</p>
              <p className="text-xs text-muted-foreground">{t('studyGuides.dualCodingHint')}</p>
              <AnswerBox guide={guide} responseKey={responseKeys.dualCoding(topic.id)} context={context} />
            </Section>
          )}
          {topic.misconceptions.length > 0 && (
            <Section title={t('studyGuides.misconceptions')}>
              <Bullets items={topic.misconceptions} />
            </Section>
          )}
        </div>
      )
    case 'self_explain':
      if (!topic) return null
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t(ACTIVITY_LABELS.self_explain.how)}</p>
          {topic.self_explanation_prompt && <p className="text-sm font-medium">{topic.self_explanation_prompt}</p>}
          <AnswerBox
            guide={guide}
            responseKey={responseKeys.selfExplain(topic.id)}
            context={context}
            reference={topic.key_ideas.join('\n')}
          />
        </div>
      )
    case 'retrieval':
    case 'interleaved_practice':
      return (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {t(ACTIVITY_LABELS[activity.type].how, { topics: topics.map((tp) => tp.title).join(', ') })}
          </p>
          {topics.map((tp) => (
            <Section key={tp.id} title={t('studyGuides.freeRecall', { topic: tp.title })}>
              <AnswerBox guide={guide} responseKey={responseKeys.recall(tp.id)} context={context} />
            </Section>
          ))}
          <Section title={t('studyGuides.practiceQuestions')}>
            <AnsweredQuestions guide={guide} questions={interleave(topics)} context={context} />
          </Section>
        </div>
      )
    case 'flashcards':
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground flex-1">{t(ACTIVITY_LABELS.flashcards.how)}</p>
          <Button type="button" size="sm" onClick={onOpenFlashcards}>
            <Layers className="mr-2 size-4" />
            {t('studyGuides.reviewCardsCount', { n: guide.due_card_count })}
          </Button>
        </div>
      )
    case 'practice_exam':
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground flex-1">{t(ACTIVITY_LABELS.practice_exam.how)}</p>
          <Button type="button" size="sm" onClick={() => onPracticeExam(topics)}>
            <GraduationCap className="mr-2 size-4" />
            {t('studyGuides.generateExam')}
          </Button>
        </div>
      )
  }
}
