'use client'

import { useState } from 'react'
import { Eye, GraduationCap, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { PracticeQuestion, StudyActivity, StudyTopic } from '@/lib/types/study-guides'
import { ACTIVITY_LABELS } from '@/lib/utils/study-guide-labels'

/** Answer hidden until the learner has tried to recall it. */
export function RevealAnswer({ answer }: { answer: string }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  if (shown) return <p className="mt-1 rounded-md bg-teal-tint p-2 text-sm">{answer}</p>
  return (
    <Button type="button" variant="ghost" size="sm" className="mt-1 h-8 px-2" onClick={() => setShown(true)}>
      <Eye className="mr-1 size-3.5" />
      {t('studyGuides.showAnswer')}
    </Button>
  )
}

export function QuestionList({ questions, hideAnswers = false }: { questions: PracticeQuestion[]; hideAnswers?: boolean }) {
  return (
    <ol className="list-decimal space-y-3 pl-5 text-sm">
      {questions.map((q, i) => (
        <li key={i}>
          <p>{q.question}</p>
          {!hideAnswers && <RevealAnswer answer={q.answer} />}
        </li>
      ))}
    </ol>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

/** Mix questions of several topics so consecutive ones change topic. */
export function interleave(topics: StudyTopic[]): PracticeQuestion[] {
  const queues = topics.map((topic) => [...topic.practice_questions])
  const mixed: PracticeQuestion[] = []
  while (queues.some((q) => q.length)) {
    for (const queue of queues) {
      const next = queue.shift()
      if (next) mixed.push(next)
    }
  }
  return mixed
}

interface ActivityMaterialProps {
  activity: StudyActivity
  topics: StudyTopic[]
  dueCardCount: number
  onOpenFlashcards: () => void
  onPracticeExam: (topics: StudyTopic[]) => void
}

/** What to do in an activity, built from the topic material of each strategy. */
export function ActivityMaterial({ activity, topics, dueCardCount, onOpenFlashcards, onPracticeExam }: ActivityMaterialProps) {
  const { t } = useTranslation()
  const topic = topics[0]

  switch (activity.type) {
    case 'pretest':
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t(ACTIVITY_LABELS.pretest.how)}</p>
          {topics.map((tp) => (
            <Section key={tp.id} title={tp.title}>
              <QuestionList questions={tp.practice_questions.slice(0, 2)} />
            </Section>
          ))}
        </div>
      )
    case 'learn':
      if (!topic) return null
      return (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t(ACTIVITY_LABELS.learn.how)}</p>
          {topic.summary && <p className="text-sm">{topic.summary}</p>}
          {topic.key_ideas.length > 0 && (
            <Section title={t('studyGuides.keyIdeas')}>
              <Bullets items={topic.key_ideas} />
            </Section>
          )}
          {topic.elaboration_questions.length > 0 && (
            <Section title={t('studyGuides.elaborationQuestions')}>
              <Bullets items={topic.elaboration_questions} />
            </Section>
          )}
          {topic.concrete_examples.length > 0 && (
            <Section title={t('studyGuides.examples')}>
              <Bullets items={topic.concrete_examples} />
            </Section>
          )}
          {topic.dual_coding_task && (
            <Section title={t('studyGuides.dualCoding')}>
              <p className="text-sm">{topic.dual_coding_task}</p>
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
          {topic.key_ideas.length > 0 && (
            <Section title={t('studyGuides.checkAgainst')}>
              <RevealAnswer answer={topic.key_ideas.join(' · ')} />
            </Section>
          )}
        </div>
      )
    case 'retrieval':
    case 'interleaved_practice':
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(ACTIVITY_LABELS[activity.type].how, {
              topics: topics.map((tp) => tp.title).join(', '),
            })}
          </p>
          <QuestionList questions={interleave(topics)} />
        </div>
      )
    case 'flashcards':
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground flex-1">{t(ACTIVITY_LABELS.flashcards.how)}</p>
          <Button type="button" size="sm" onClick={onOpenFlashcards}>
            <Layers className="mr-2 size-4" />
            {t('studyGuides.reviewCardsCount', { n: dueCardCount })}
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
