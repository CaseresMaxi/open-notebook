import type { NoteResponse } from '@/lib/types/api'

// Metadata travels with the existing note record: no parallel storage or schema migration.
export const SUMMARY_MARKER = '<!-- open-notebook:study-summary:v1 -->'
export function isStudySummary(note: Pick<NoteResponse, 'content'>) {
  return note.content?.startsWith(SUMMARY_MARKER) ?? false
}
export function summaryContent(text: string) {
  return text.startsWith(SUMMARY_MARKER)
    ? text.slice(SUMMARY_MARKER.length).replace(/^\r?\n(?:\r?\n)?/, '')
    : text
}
