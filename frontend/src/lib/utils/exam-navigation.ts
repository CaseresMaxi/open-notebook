/**
 * Exams are opened from the exam list, a notebook or a chat. The exam page
 * keeps where it was opened from in `?from=`, so "back" returns there (and
 * survives a reload) instead of always landing on the full exam list.
 */
import type { ExamAnswers } from '@/lib/types/exams'

/** Same-app paths only: never an absolute or protocol-relative URL. */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  return value
}

export function examHref(id: string, from?: string | null): string {
  const href = `/exams/${encodeURIComponent(id)}`
  const back = safeReturnPath(from)
  return back ? `${href}?from=${encodeURIComponent(back)}` : href
}

export function examListHref(notebookId?: string | null): string {
  return notebookId ? `/exams?notebook=${encodeURIComponent(notebookId)}` : '/exams'
}

/** The page an exam is opened from, without the one-shot "create" flag. */
export function currentPath(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const url = new URL(window.location.href)
  url.searchParams.delete('new')
  return url.pathname + url.search
}

// Unsent answers survive leaving the exam and coming back in the same tab.
const draftKey = (examId: string) => `exam-draft:${examId}`

export function loadExamDraft(examId: string): ExamAnswers {
  try {
    const raw = sessionStorage.getItem(draftKey(examId))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as ExamAnswers) : {}
  } catch {
    return {}
  }
}

export function saveExamDraft(examId: string, answers: ExamAnswers): void {
  try {
    if (Object.keys(answers).length) sessionStorage.setItem(draftKey(examId), JSON.stringify(answers))
    else sessionStorage.removeItem(draftKey(examId))
  } catch {
    // Storage can be unavailable (private mode); the draft is a convenience.
  }
}
