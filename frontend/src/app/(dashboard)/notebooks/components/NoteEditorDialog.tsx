'use client'

import { isStudySummary, summaryContent, SUMMARY_MARKER } from '@/lib/utils/study-summary'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useCreateNote, useUpdateNote, useNote } from '@/lib/hooks/use-notes'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { LiquidSurface } from '@/components/layout/LiquidSurface'
import { MarkdownEditor } from '@/components/ui/markdown-editor'
import { InlineEdit } from '@/components/common/InlineEdit'
import { useTranslation } from '@/lib/hooks/use-translation'
import { ContentUnavailable } from '@/components/common/ContentUnavailable'
import { isNotFoundError } from '@/lib/utils/error-handler'

const createNoteSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1, 'Content is required'),
})

type CreateNoteFormData = z.infer<typeof createNoteSchema>

interface NoteEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  notebookId: string
  note?: { id: string; title: string | null; content: string | null }
}

export function NoteEditorDialog({ open, onOpenChange, notebookId, note }: NoteEditorDialogProps) {
  const { t } = useTranslation()
  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const queryClient = useQueryClient()
  const isEditing = Boolean(note)

  // Ensure note ID has 'note:' prefix for API calls
  const noteIdWithPrefix = note?.id
    ? (note.id.includes(':') ? note.id : `note:${note.id}`)
    : ''

  const {
    data: fetchedNote,
    isLoading: noteLoading,
    isError: noteError,
    error: noteFetchError,
  } = useNote(noteIdWithPrefix, { enabled: open && !!note?.id })
  // When editing, a failed fetch means we must not render the editor: the
  // note may have been deleted (dangling chat/ask references) and offering
  // an empty editor would invite ghost edits.
  const noteUnavailable = isEditing && noteError
  const isSaving = isEditing ? updateNote.isPending : createNote.isPending
  const {
    handleSubmit,
    control,
    formState: { errors, isDirty },
    reset,
    setValue,
  } = useForm<CreateNoteFormData>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: {
      title: '',
      content: '',
    },
  })
  const watchTitle = useWatch({ control, name: 'title' })
  const content = useWatch({ control, name: 'content' })
  const [writing, setWriting] = useState(!note)

  useEffect(() => {
    if (open) setWriting(!isEditing)
  }, [open, note?.id, isEditing])

  useEffect(() => {
    if (!open) {
      reset({ title: '', content: '' })
      return
    }

    const source = fetchedNote ?? note
    const title = source?.title ?? ''
    const content = summaryContent(source?.content ?? '')

    reset({ title, content })
  }, [open, note, fetchedNote, reset])

  const onSubmit = async (data: CreateNoteFormData) => {
    if (note) {
      await updateNote.mutateAsync({
        id: noteIdWithPrefix,
        data: {
          title: data.title || undefined,
          content: isStudySummary(fetchedNote ?? note) ? `${SUMMARY_MARKER}\n\n${data.content}` : data.content,
        },
      })
      // Only invalidate notebook-specific queries if we have a notebookId
      if (notebookId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notes(notebookId) })
      }
    } else {
      // Creating a note requires a notebookId
      if (!notebookId) {
        console.error('Cannot create note without notebook_id')
        return
      }
      await createNote.mutateAsync({
        title: data.title || undefined,
        content: data.content,
        note_type: 'human',
        notebook_id: notebookId,
      })
    }
    reset()
    onOpenChange(false)
  }

  const handleClose = () => {
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="product-shell note-dialog">
        <DialogTitle className="sr-only">
          {isEditing ? t('sources.editNote') : t('sources.createNote')}
        </DialogTitle>
        {noteUnavailable ? (
          <ContentUnavailable
            variant={isNotFoundError(noteFetchError) ? 'not-found' : 'error'}
            onClose={handleClose}
          />
        ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 min-h-0 flex-col min-w-0">
          {isEditing && noteLoading ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
            </div>
          ) : (
            <>
              <header className="note-dialog-heading">
                {writing ? <InlineEdit
                  id="note-title" name="title" value={watchTitle ?? ''}
                  onSave={(value) => setValue('title', value || '', { shouldDirty: true })}
                  placeholder={t('sources.addTitle')} emptyText={t('sources.untitledNote')}
                  className="note-dialog-title" inputClassName="note-dialog-title"
                /> : <h2 className="note-dialog-title" title={watchTitle || t('sources.untitledNote')}>{watchTitle || t('sources.untitledNote')}</h2>}
              </header>
              <div className={`note-dialog-body ${writing ? 'note-dialog-writing' : 'note-dialog-reading'}`}>
                {writing ? <Controller control={control} name="content" render={({ field }) => (
                  <MarkdownEditor key={note?.id ?? 'new'} textareaId="note-content" name="content"
                    value={field.value} onChange={field.onChange} height="100%" preview="edit" compact
                    placeholder={t('sources.writeNotePlaceholder')} className="note-markdown-editor" />
                )} /> : <article className="note-reading-content"><MarkdownRenderer>{content || ''}</MarkdownRenderer></article>}
                {errors.content && <p className="text-sm text-destructive mt-1">{errors.content.message}</p>}
              </div>
            </>
          )}

          <footer className="note-dialog-footer">
            <LiquidSurface className="note-mode-control" radius={14}>
              <Button type="button" variant="ghost" disabled={noteLoading || isSaving}
                onClick={() => setWriting(value => !value)}>
                {writing ? t('product.preview') : t('common.edit')}
              </Button>
            </LiquidSurface>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={isSaving}>
                {writing || isDirty || !isEditing ? t('common.cancel') : t('common.close')}
              </Button>
              {(writing || isDirty || !isEditing) && <Button type="submit" disabled={isSaving || (isEditing && noteLoading)}>
                {isSaving ? t('common.saving') : isEditing ? t('sources.saveNote') : t('sources.createNoteBtn')}
              </Button>}
            </div>
          </footer>
        </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
