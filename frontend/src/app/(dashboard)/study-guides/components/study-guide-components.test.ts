import { describe, expect, it } from 'vitest'
import { nextQueue } from './FlashcardReview'
import { interleave } from './ActivityMaterial'
import type { StudyTopic } from '@/lib/types/study-guides'

const topic = (id: string, questions: string[]): StudyTopic => ({
  id,
  title: id,
  summary: '',
  key_ideas: [],
  prerequisites: [],
  difficulty: 'medium',
  importance: 2,
  source_ids: [],
  elaboration_questions: [],
  self_explanation_prompt: '',
  concrete_examples: [],
  dual_coding_task: '',
  misconceptions: [],
  practice_questions: questions.map((question) => ({ question, answer: `${question}!` })),
})

describe('study guide review helpers', () => {
  it('sends a failed card to the end of the queue and drops recalled ones', () => {
    expect(nextQueue(['c1', 'c2', 'c3'], 'again')).toEqual(['c2', 'c3', 'c1'])
    expect(nextQueue(['c1', 'c2'], 'good')).toEqual(['c2'])
    expect(nextQueue([], 'again')).toEqual([])
  })

  it('alternates questions between topics', () => {
    const mixed = interleave([topic('a', ['a1', 'a2', 'a3']), topic('b', ['b1'])])
    expect(mixed.map((q) => q.question)).toEqual(['a1', 'b1', 'a2', 'a3'])
    // Each question keeps its topic and index, so its stored answers are found.
    expect(mixed.map((q) => `${q.topicId}:${q.index}`)).toEqual(['a:0', 'b:0', 'a:1', 'a:2'])
  })
})
