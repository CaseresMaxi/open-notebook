import type { ExamAnswer, OpenExamAnswer } from '@/lib/types/exams'

export function openExamAnswer(value: ExamAnswer | undefined): OpenExamAnswer {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  return { text: typeof value === 'string' ? value : '', images: [] }
}

export function hasOpenAnswer(value: ExamAnswer | undefined): boolean {
  const answer = openExamAnswer(value)
  return !!answer.text.trim() || answer.images.length > 0
}
