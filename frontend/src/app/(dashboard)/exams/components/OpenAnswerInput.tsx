'use client'

import { useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ChatImages } from '@/components/sources/ChatImages'
import { useTranslation } from '@/lib/hooks/use-translation'
import { readChatImages, CHAT_IMAGE_TYPES } from '@/lib/utils/chat-images'
import { openExamAnswer } from '@/lib/utils/exam-answers'
import type { ExamAnswer } from '@/lib/types/exams'

export function OpenAnswerInput({ value, onChange, disabled }: {
  value: ExamAnswer | undefined
  onChange: (value: ExamAnswer) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const fileInput = useRef<HTMLInputElement>(null)
  const readingRef = useRef(false)
  const [reading, setReading] = useState(false)
  const answer = openExamAnswer(value)
  const current = useRef(answer)
  current.current = answer
  const busy = disabled || reading
  const attach = async (files: File[]) => {
    if (disabled || readingRef.current || !files.length) return
    readingRef.current = true
    setReading(true)
    try {
      const images = await readChatImages(files, current.current.images.length)
      onChange({ ...current.current, images: [...current.current.images, ...images] })
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'chat.imageReadFailed'))
    } finally { readingRef.current = false; setReading(false) }
  }
  return <div className="space-y-3" onDragOver={event => { if (!busy) event.preventDefault() }} onDrop={event => {
    event.preventDefault()
    if (!busy) void attach(Array.from(event.dataTransfer.files))
  }}>
    <Textarea rows={6} value={answer.text} placeholder={t('exams.openPlaceholder')} disabled={busy}
      onChange={event => onChange(answer.images.length ? { ...answer, text: event.target.value } : event.target.value)}
      onPaste={event => {
        const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith('image/'))
        if (files.length && !busy) { event.preventDefault(); void attach(files) }
      }} />
    {!!answer.images.length && <ChatImages images={answer.images} showProvenance={false} disabled={busy}
      onRemove={index => onChange({ ...answer, images: answer.images.filter((_, position) => position !== index) })} />}
    <input ref={fileInput} type="file" className="hidden" accept={CHAT_IMAGE_TYPES.join(',')} multiple disabled={busy}
      aria-label={t('chat.attachImages')} onChange={event => { void attach(Array.from(event.target.files || [])); event.target.value = '' }} />
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />{t('chat.attachImages')}</Button>
    <p className="text-xs text-muted-foreground">{t('chat.imageHint')}</p>
  </div>
}
