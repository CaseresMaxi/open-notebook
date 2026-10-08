'use client'

import { useState } from 'react'
import type { ChatFollowup } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'

export function ChatFollowupCard({ followup, disabled, onReply, onCreateExam }: {
  followup: ChatFollowup
  disabled?: boolean
  onReply?: (message: string) => void | boolean | Promise<void | boolean>
  onCreateExam?: () => void
}) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const reply = async (message: string) => {
    if (!onReply || pending || disabled) return
    setPending(true)
    try { await onReply(message) } finally { setPending(false) }
  }
  return <section className="space-y-3 rounded-md border p-3" aria-label={t('chat.continueQuestion')}>
    <p className="text-sm">{followup.kind === 'study' ? t('chat.studyFormatQuestion') : followup.kind === 'exam' ? t('chat.separateExam') : followup.question}</p>
    <div className="flex flex-wrap gap-2">
      {followup.kind !== 'question' ? <>
        <Button size="sm" variant="outline" disabled={disabled || pending || !onCreateExam} onClick={onCreateExam}>{t('chat.separateExam')}</Button>
        {followup.kind === 'study' && <Button size="sm" disabled={disabled || pending || !onReply} onClick={() => void reply(t('chat.inlineTestReply'))}>{t('chat.testInChat')}</Button>}
      </> : followup.options?.map(option => <Button key={option.label} size="sm" variant="outline" disabled={disabled || pending || !onReply} onClick={() => void reply(option.message)}>{option.label}</Button>)}
    </div>
  </section>
}
