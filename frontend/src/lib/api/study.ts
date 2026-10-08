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
