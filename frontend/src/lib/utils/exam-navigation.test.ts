import { afterEach, describe, expect, it } from 'vitest'
import { examHref, examListHref, loadExamDraft, safeReturnPath, saveExamDraft } from './exam-navigation'

describe('exam navigation', () => {
  afterEach(() => sessionStorage.clear())

  it('only accepts same-app return paths', () => {
    expect(safeReturnPath('/notebooks/notebook%3A1?tab=chat')).toBe('/notebooks/notebook%3A1?tab=chat')
    expect(safeReturnPath('//evil.example')).toBeNull()
    expect(safeReturnPath('https://evil.example')).toBeNull()
    expect(safeReturnPath('/\\evil.example')).toBeNull()
    expect(safeReturnPath(null)).toBeNull()
  })

  it('carries where an exam was opened from', () => {
    expect(examHref('exam:1', '/exams?notebook=notebook%3A2')).toBe(
      '/exams/exam%3A1?from=%2Fexams%3Fnotebook%3Dnotebook%253A2'
    )
    expect(examHref('exam:1', 'https://evil.example')).toBe('/exams/exam%3A1')
    expect(examListHref('notebook:2')).toBe('/exams?notebook=notebook%3A2')
    expect(examListHref()).toBe('/exams')
  })

  it('keeps unsent answers per exam until they are cleared', () => {
    saveExamDraft('exam:1', { q1: 2, q2: ['a'] })
    expect(loadExamDraft('exam:1')).toEqual({ q1: 2, q2: ['a'] })
    expect(loadExamDraft('exam:2')).toEqual({})
    saveExamDraft('exam:1', {})
    expect(loadExamDraft('exam:1')).toEqual({})
    sessionStorage.setItem('exam-draft:exam:3', '[1]')
    expect(loadExamDraft('exam:3')).toEqual({})
  })
})
