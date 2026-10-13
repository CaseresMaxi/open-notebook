import apiClient from './client'
import type { NoteResponse } from '@/lib/types/api'

/**
 * Generate and save a study summary of one source or of a topic across the
 * notebook. The server grounds it in the original material: quotations are
 * verified verbatim and figures are genuine crops of the source documents.
 */
export async function createStudySummary({
  notebookId,
  sourceId,
  topic,
  language,
  title,
}: {
  notebookId: string
  sourceId?: string
  topic?: string
  language: string
  title: string
}) {
  const { data } = await apiClient.post<NoteResponse>(
    `/notebooks/${encodeURIComponent(notebookId)}/study-summaries`,
    { source_id: sourceId, topic, language, title }
  )
  return data
}
