import { describe, expect, it } from 'vitest'
import {
  addDays,
  calibration,
  daysBetween,
  groupByWeek,
  localToday,
  progressPercent,
  sessionStatus,
} from './study-guide'
import type { StudySession } from '@/lib/types/study-guides'

const session = (date: string, ids: string[]): StudySession => ({
  id: date,
  date,
  minutes: 30,
  activities: ids.map((id) => ({ id, type: 'learn', topic_ids: ['t1'], minutes: 15 })),
})

describe('study guide utils', () => {
  it('uses the local calendar date', () => {
    expect(localToday(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02')
    expect(daysBetween('2026-11-08', '2026-11-30')).toBe(22)
  })

  it('classifies sessions against today and completed activities', () => {
    const done = new Set(['a'])
    expect(sessionStatus(session('2026-11-01', ['a']), done, '2026-11-08')).toBe('done')
    expect(sessionStatus(session('2026-11-01', ['a', 'b']), done, '2026-11-08')).toBe('partial')
    expect(sessionStatus(session('2026-11-02', ['c']), done, '2026-11-08')).toBe('missed')
    expect(sessionStatus(session('2026-11-08', ['c']), done, '2026-11-08')).toBe('today')
    expect(sessionStatus(session('2026-11-09', ['c']), done, '2026-11-08')).toBe('upcoming')
  })

  it('groups sessions by week starting on Monday', () => {
    const weeks = groupByWeek([session('2026-11-08', []), session('2026-11-09', []), session('2026-11-15', [])])
    expect(weeks.map(([monday, items]) => [monday, items.length])).toEqual([
      ['2026-11-02', 1],
      ['2026-11-09', 2],
    ])
  })

  it('computes progress and confidence calibration', () => {
    expect(progressPercent({ completed_count: 1, activity_count: 3 })).toBe(33)
    expect(progressPercent({ completed_count: 0, activity_count: 0 })).toBe(0)
    expect(calibration(5, 0.3, 6)).toBe('overconfident')
    expect(calibration(1, 0.9, 6)).toBe('underconfident')
    expect(calibration(4, 0.8, 6)).toBe('calibrated')
    expect(calibration(5, 0.3, 2)).toBeNull()
  })
})

describe('stored answers', () => {
  it('builds question keys and analyzes only open answers automatically', async () => {
    const { responseKeys, autoAnalyze } = await import('./study-guide')
    expect(responseKeys.practice('t1', 2)).toBe('t1:practice:2')
    expect(autoAnalyze(responseKeys.selfExplain('t1'))).toBe(true)
    expect(autoAnalyze(responseKeys.recall('t2'))).toBe(true)
    expect(autoAnalyze(responseKeys.practice('t1', 0))).toBe(false)
    expect(autoAnalyze(responseKeys.card('c1'))).toBe(false)
  })

  it('keeps unsaved drafts until they are cleared', async () => {
    const { loadAnswerDraft, saveAnswerDraft } = await import('./study-guide')
    saveAnswerDraft('g1', 't1:recall', 'a1', 'half an answer')
    expect(loadAnswerDraft('g1', 't1:recall', 'a1')).toBe('half an answer')
    saveAnswerDraft('g1', 't1:recall', 'a1', { text: ' ', images: [] })
    expect(loadAnswerDraft('g1', 't1:recall', 'a1')).toBeUndefined()
  })
})
