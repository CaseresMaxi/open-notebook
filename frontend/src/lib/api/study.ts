import apiClient from './client'
import { sourcesApi } from './sources'
import { transformationsApi } from './transformations'
import { notesApi } from './notes'
import { SUMMARY_MARKER } from '@/lib/utils/study-summary'

export async function generateStudySummary({
  notebookId,
  sourceId,
  templateId,
  instructions,
  title,
  sourceLabel,
  emptyError,
  outputError,
}: {
  notebookId: string
  sourceId: string
  templateId: string
  instructions: string
  title: (sourceTitle: string) => string
  sourceLabel: string
  emptyError: string
  outputError: string
}) {
  const source = await sourcesApi.get(sourceId)
  if (!source.full_text?.trim()) throw new Error(emptyError)
  const result = await transformationsApi.execute({
    transformation_id: templateId,
    input_text: `${instructions}\n\n${source.full_text}`,
  })
  if (!result.output?.trim()) throw new Error(outputError)
  return notesApi.create({
    notebook_id: notebookId,
    note_type: 'ai',
    title: title(source.title || sourceLabel),
    content: `${SUMMARY_MARKER}\n\n[${sourceLabel}](/sources/${encodeURIComponent(sourceId)})\n\n${result.output}`,
  })
}

/**
 * Study summary about a free-text topic across one notebook's sources. Reuses
 * the Ask pipeline (search strategy, per-search answers, final synthesis) and
 * stores the result as a regular study summary.
 */
export async function generateTopicSummary({
  notebookId,
  modelId,
  question,
  title,
  outputError,
}: {
  notebookId: string
  modelId: string
  question: string
  title: string
  outputError: string
}) {
  const { data } = await apiClient.post<{ answer: string }>('/search/ask/simple', {
    question,
    strategy_model: modelId,
    answer_model: modelId,
    final_answer_model: modelId,
    notebook_ids: [notebookId],
  })
  if (!data.answer?.trim()) throw new Error(outputError)
  return notesApi.create({
    notebook_id: notebookId,
    note_type: 'ai',
    title,
    content: `${SUMMARY_MARKER}\n\n${data.answer}`,
  })
}
