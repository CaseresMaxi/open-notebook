/**
 * Literal translation keys for study-guide enums. Keys are spelled out (not
 * built with template strings) so the unused-key check can find them.
 */
import type {
  CardRating,
  StudyActivityType,
  StudyGoal,
  StudyLevel,
  StudyTopic,
} from '@/lib/types/study-guides'
import type { SessionStatus } from './study-guide'

export const GOAL_LABELS: Record<StudyGoal, string> = {
  understand: 'studyGuides.goals.understand',
  memorize: 'studyGuides.goals.memorize',
  exam: 'studyGuides.goals.exam',
  apply: 'studyGuides.goals.apply',
}

export const GOAL_HINTS: Record<StudyGoal, string> = {
  understand: 'studyGuides.goalHints.understand',
  memorize: 'studyGuides.goalHints.memorize',
  exam: 'studyGuides.goalHints.exam',
  apply: 'studyGuides.goalHints.apply',
}

export const LEVEL_LABELS: Record<StudyLevel, string> = {
  beginner: 'studyGuides.levels.beginner',
  intermediate: 'studyGuides.levels.intermediate',
  advanced: 'studyGuides.levels.advanced',
}

export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'studyGuides.weekdays.0',
  1: 'studyGuides.weekdays.1',
  2: 'studyGuides.weekdays.2',
  3: 'studyGuides.weekdays.3',
  4: 'studyGuides.weekdays.4',
  5: 'studyGuides.weekdays.5',
  6: 'studyGuides.weekdays.6',
}

export const STATUS_LABELS: Record<SessionStatus, string> = {
  done: 'studyGuides.status.done',
  partial: 'studyGuides.status.partial',
  missed: 'studyGuides.status.missed',
  today: 'studyGuides.status.today',
  upcoming: 'studyGuides.status.upcoming',
}

export const DIFFICULTY_LABELS: Record<StudyTopic['difficulty'], string> = {
  easy: 'studyGuides.difficulty.easy',
  medium: 'studyGuides.difficulty.medium',
  hard: 'studyGuides.difficulty.hard',
}

export const CONFIDENCE_LABELS: Record<number, string> = {
  1: 'studyGuides.confidence.1',
  2: 'studyGuides.confidence.2',
  3: 'studyGuides.confidence.3',
  4: 'studyGuides.confidence.4',
  5: 'studyGuides.confidence.5',
}

export const RATING_LABELS: Record<CardRating, string> = {
  again: 'studyGuides.ratings.again',
  hard: 'studyGuides.ratings.hard',
  good: 'studyGuides.ratings.good',
  easy: 'studyGuides.ratings.easy',
}

export const CALIBRATION_LABELS = {
  overconfident: 'studyGuides.calibration.overconfident',
  underconfident: 'studyGuides.calibration.underconfident',
} as const

export const ACTIVITY_LABELS: Record<StudyActivityType, { title: string; how: string }> = {
  pretest: { title: 'studyGuides.activities.pretest.title', how: 'studyGuides.activities.pretest.how' },
  learn: { title: 'studyGuides.activities.learn.title', how: 'studyGuides.activities.learn.how' },
  self_explain: {
    title: 'studyGuides.activities.self_explain.title',
    how: 'studyGuides.activities.self_explain.how',
  },
  retrieval: { title: 'studyGuides.activities.retrieval.title', how: 'studyGuides.activities.retrieval.how' },
  interleaved_practice: {
    title: 'studyGuides.activities.interleaved_practice.title',
    how: 'studyGuides.activities.interleaved_practice.how',
  },
  flashcards: { title: 'studyGuides.activities.flashcards.title', how: 'studyGuides.activities.flashcards.how' },
  practice_exam: {
    title: 'studyGuides.activities.practice_exam.title',
    how: 'studyGuides.activities.practice_exam.how',
  },
}

export type StrategyKey =
  | 'retrieval'
  | 'spacing'
  | 'interleaving'
  | 'elaboration'
  | 'selfExplanation'
  | 'concreteExamples'
  | 'dualCoding'
  | 'pretesting'
  | 'metacognition'

type StrategyLabels = { name: string; what: string; evidence: string; inPlan: string }

export const STRATEGY_LABELS: Record<StrategyKey, StrategyLabels> = {
  retrieval: {
    name: 'studyGuides.strategies.retrieval.name',
    what: 'studyGuides.strategies.retrieval.what',
    evidence: 'studyGuides.strategies.retrieval.evidence',
    inPlan: 'studyGuides.strategies.retrieval.inPlan',
  },
  spacing: {
    name: 'studyGuides.strategies.spacing.name',
    what: 'studyGuides.strategies.spacing.what',
    evidence: 'studyGuides.strategies.spacing.evidence',
    inPlan: 'studyGuides.strategies.spacing.inPlan',
  },
  interleaving: {
    name: 'studyGuides.strategies.interleaving.name',
    what: 'studyGuides.strategies.interleaving.what',
    evidence: 'studyGuides.strategies.interleaving.evidence',
    inPlan: 'studyGuides.strategies.interleaving.inPlan',
  },
  elaboration: {
    name: 'studyGuides.strategies.elaboration.name',
    what: 'studyGuides.strategies.elaboration.what',
    evidence: 'studyGuides.strategies.elaboration.evidence',
    inPlan: 'studyGuides.strategies.elaboration.inPlan',
  },
  selfExplanation: {
    name: 'studyGuides.strategies.selfExplanation.name',
    what: 'studyGuides.strategies.selfExplanation.what',
    evidence: 'studyGuides.strategies.selfExplanation.evidence',
    inPlan: 'studyGuides.strategies.selfExplanation.inPlan',
  },
  concreteExamples: {
    name: 'studyGuides.strategies.concreteExamples.name',
    what: 'studyGuides.strategies.concreteExamples.what',
    evidence: 'studyGuides.strategies.concreteExamples.evidence',
    inPlan: 'studyGuides.strategies.concreteExamples.inPlan',
  },
  dualCoding: {
    name: 'studyGuides.strategies.dualCoding.name',
    what: 'studyGuides.strategies.dualCoding.what',
    evidence: 'studyGuides.strategies.dualCoding.evidence',
    inPlan: 'studyGuides.strategies.dualCoding.inPlan',
  },
  pretesting: {
    name: 'studyGuides.strategies.pretesting.name',
    what: 'studyGuides.strategies.pretesting.what',
    evidence: 'studyGuides.strategies.pretesting.evidence',
    inPlan: 'studyGuides.strategies.pretesting.inPlan',
  },
  metacognition: {
    name: 'studyGuides.strategies.metacognition.name',
    what: 'studyGuides.strategies.metacognition.what',
    evidence: 'studyGuides.strategies.metacognition.evidence',
    inPlan: 'studyGuides.strategies.metacognition.inPlan',
  },
}

/** Strategy behind each activity type. */
export const ACTIVITY_STRATEGY: Record<StudyActivityType, StrategyKey> = {
  pretest: 'pretesting',
  learn: 'elaboration',
  self_explain: 'selfExplanation',
  retrieval: 'retrieval',
  interleaved_practice: 'interleaving',
  flashcards: 'spacing',
  practice_exam: 'retrieval',
}
