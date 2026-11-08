export type StudyGoal = 'understand' | 'memorize' | 'exam' | 'apply'
export type StudyLevel = 'beginner' | 'intermediate' | 'advanced'
import type { ChatImage } from './api'

export type CardRating = 'again' | 'hard' | 'good' | 'easy'
export type ResponseGrade = 'correct' | 'partial' | 'incorrect'

/** One stored answer of the learner to a question of the guide. */
export interface StudyResponse {
  id: string
  text: string
  images: ChatImage[]
  context: string
  grade?: ResponseGrade | null
  feedback?: string | null
  score?: number | null
  graded_by?: 'self' | 'ai' | null
  created: string
}
export type StudyActivityType =
  | 'pretest'
  | 'learn'
  | 'self_explain'
  | 'retrieval'
  | 'interleaved_practice'
  | 'flashcards'
  | 'practice_exam'

export interface PracticeQuestion {
  question: string
  answer: string
}

export interface StudyTopic {
  id: string
  title: string
  summary: string
  key_ideas: string[]
  prerequisites: string[]
  difficulty: 'easy' | 'medium' | 'hard'
  importance: number
  source_ids: string[]
  elaboration_questions: string[]
  self_explanation_prompt: string
  concrete_examples: string[]
  dual_coding_task: string
  misconceptions: string[]
  practice_questions: PracticeQuestion[]
}

export interface StudyActivity {
  id: string
  type: StudyActivityType
  topic_ids: string[]
  minutes: number
}

export interface StudySession {
  id: string
  date: string
  minutes: number
  activities: StudyActivity[]
}

export interface CardState {
  ease: number
  interval: number
  repetitions: number
  lapses: number
  due: string | null
  last_rating: CardRating | null
  reviews: number
  correct: number
}

export interface Flashcard {
  id: string
  topic_id: string
  front: string
  back: string
  state: CardState
  next_intervals: Record<CardRating, number>
}

export interface TopicStats {
  cards: number
  mastered: number
  reviews: number
  correct: number
  recall_rate: number | null
}

export interface StudyGuide {
  id: string
  notebook_id: string
  title: string
  overview: string
  goal: StudyGoal
  level: StudyLevel
  language?: string | null
  instructions?: string | null
  focus_topics: string[]
  source_ids: string[]
  include_notes: boolean
  grounded: boolean
  coverage_gaps: string[]
  start_date: string
  end_date: string
  exam_date?: string | null
  weekdays: number[]
  minutes_per_session: number
  overloaded: boolean
  topic_count: number
  card_count: number
  activity_count: number
  completed_count: number
  due_card_count: number
  next_session_date?: string | null
  // Details: only in single-guide responses
  topics?: StudyTopic[] | null
  sessions?: StudySession[] | null
  cards?: Flashcard[] | null
  due_card_ids?: string[] | null
  completed_activities?: string[] | null
  topic_confidence?: Record<string, number> | null
  topic_stats?: Record<string, TopicStats> | null
  responses?: Record<string, StudyResponse[]> | null
  response_count?: number
  created: string
  updated: string
}

export interface CreateStudyGuideRequest {
  notebook_id: string
  source_ids?: string[]
  include_notes: boolean
  focus_topics: string[]
  goal: StudyGoal
  level: StudyLevel
  start_date?: string
  exam_date?: string
  duration_days?: number
  weekdays: number[]
  minutes_per_session: number
  language?: string
  instructions?: string
  title?: string
  model_id?: string
}

export interface RescheduleRequest {
  today?: string
  exam_date?: string
  end_date?: string
  weekdays?: number[]
  minutes_per_session?: number
}
