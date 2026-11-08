import type { StudyGuide, StudySession } from '@/lib/types/study-guides'

/** YYYY-MM-DD in the learner's time zone (not UTC). */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** A plan date (YYYY-MM-DD) as a local Date at midnight. */
export function parsePlanDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parsePlanDate(to).getTime() - parsePlanDate(from).getTime()) / 86_400_000)
}

export function addDays(value: string, days: number): string {
  const date = parsePlanDate(value)
  date.setDate(date.getDate() + days)
  return localToday(date)
}

export type SessionStatus = 'done' | 'partial' | 'missed' | 'today' | 'upcoming'

export function sessionStatus(session: StudySession, completed: Set<string>, today: string): SessionStatus {
  const done = session.activities.filter((a) => completed.has(a.id)).length
  if (done === session.activities.length) return 'done'
  if (session.date === today) return 'today'
  if (session.date > today) return 'upcoming'
  return done > 0 ? 'partial' : 'missed'
}

/** Sessions of the guide that are today or still pending. */
export function todaySession(guide: StudyGuide, today: string): StudySession | undefined {
  return guide.sessions?.find((s) => s.date === today)
}

export function nextSession(guide: StudyGuide, today: string): StudySession | undefined {
  return guide.sessions?.find((s) => s.date > today)
}

export function missedSessionCount(guide: StudyGuide, today: string): number {
  const completed = new Set(guide.completed_activities ?? [])
  return (guide.sessions ?? []).filter((s) => sessionStatus(s, completed, today) === 'missed').length
}

/** Group sessions by the Monday of their week (keys in YYYY-MM-DD). */
export function groupByWeek(sessions: StudySession[]): [string, StudySession[]][] {
  const weeks = new Map<string, StudySession[]>()
  for (const session of sessions) {
    const date = parsePlanDate(session.date)
    const offset = (date.getDay() + 6) % 7
    const monday = addDays(session.date, -offset)
    weeks.set(monday, [...(weeks.get(monday) ?? []), session])
  }
  return [...weeks.entries()]
}

export function progressPercent(guide: Pick<StudyGuide, 'completed_count' | 'activity_count'>): number {
  return guide.activity_count ? Math.round((guide.completed_count / guide.activity_count) * 100) : 0
}

/** Confidence (1-5) far above actual flashcard recall: an illusion of knowing. */
export function calibration(confidence: number | undefined, recallRate: number | null | undefined, reviews: number) {
  if (!confidence || recallRate == null || reviews < 3) return null
  const expected = (confidence - 1) / 4
  if (expected - recallRate > 0.3) return 'overconfident' as const
  if (recallRate - expected > 0.3) return 'underconfident' as const
  return 'calibrated' as const
}

export const WEEKDAY_ORDER = [0, 1, 2, 3, 4, 5, 6] as const
