'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Drawer as Dialog, DrawerContent, DrawerTrigger as DialogTrigger } from '@/components/arc/drawer/drawer'
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { ChatMemory } from '@/lib/api/chat'
import type { SourceListResponse, NoteResponse } from '@/lib/types/api'
import type { ContextSelections, ContextMode, NoteContextMode } from '@/lib/types/notebook-context'

interface Props {
  sources: SourceListResponse[]
  notes: NoteResponse[]
  selections: ContextSelections
  onSourceChange?: (id: string, mode: ContextMode) => void
  onNoteChange?: (id: string, mode: NoteContextMode) => void
  onExcludeMaterials?: () => void
  memory?: ChatMemory
  materialTokens: number
  hasSession: boolean
  loading?: boolean
  error?: boolean
  busy?: boolean
  onMemoryChange: (action: 'limit' | 'reset' | 'clear', turns?: number | null) => void
}

export function NotebookContextDialog(props: Props) {
  const { t } = useTranslation()
  const [confirmation, setConfirmation] = useState<'reset' | 'clear' | null>(null)
  const disabled = props.busy || props.loading || props.error || !props.hasSession
  return <>
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost" size="sm" disabled={props.busy} aria-label={t('chat.manageContext')}><SlidersHorizontal className="h-4 w-4" /><span className="text-xs">{t('chat.manageContext')}</span></Button></DialogTrigger>
      <DrawerContent closeLabel={t('common.close')} className="product-shell" title={t('chat.manageContext')} description={t('chat.contextHelp')}>
        <section className="space-y-3">
          <h3 className="font-medium">{t('chat.conversationMemory')}</h3>
          {!props.hasSession ? <p className="text-sm text-muted-foreground">{t('chat.createToStart')}</p> : props.loading ? <p role="status">{t('common.loading')}</p> : props.error ? <p role="alert">{t('chat.contextLoadFailed')}</p> : <p className="text-sm text-muted-foreground">{t('chat.memoryStats', { active: props.memory?.active_messages ?? 0, total: props.memory?.total_messages ?? 0, tokens: props.memory?.history_tokens ?? 0 })}</p>}
          <label className="flex flex-col gap-1 text-sm">{t('chat.rememberTurns')}
            <select className="rounded-md border bg-background p-2" disabled={disabled} value={props.memory?.history_turns ?? 'all'} onChange={event => props.onMemoryChange('limit', event.target.value === 'all' ? null : Number(event.target.value))}>
              <option value="all">{t('chat.allHistory')}</option>
              <option value="0">{t('chat.noHistory')}</option>
              {[2, 5, 10, 20, 50].map(turns => <option key={turns} value={turns}>{t('chat.lastTurns', { count: turns })}</option>)}
              {props.memory?.history_turns != null && ![0, 2, 5, 10, 20, 50].includes(props.memory.history_turns) && <option value={props.memory.history_turns}>{t('chat.lastTurns', { count: props.memory.history_turns })}</option>}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={disabled || !props.memory?.active_messages} onClick={() => setConfirmation('reset')}>{t('chat.resetMemory')}</Button>
            <Button variant="destructive" disabled={disabled || !props.memory?.total_messages} onClick={() => setConfirmation('clear')}>{t('chat.clearHistory')}</Button>
          </div>
        </section>
        <section className="space-y-3 border-t pt-4">
          <h3 className="font-medium">{t('chat.contextMaterials')}</h3>
          <p className="text-sm text-muted-foreground">{t('chat.materialStats', { tokens: props.materialTokens })}</p>
          <Button variant="outline" disabled={props.busy || !props.onExcludeMaterials} onClick={props.onExcludeMaterials}>{t('chat.excludeMaterials')}</Button>
          {props.sources.map(source => <label key={source.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">{source.title || source.id}</span>
            <select aria-label={source.title || source.id} className="shrink-0 rounded-md border bg-background p-2" disabled={props.busy || !props.onSourceChange} value={props.selections.sources[source.id] ?? 'off'} onChange={event => props.onSourceChange?.(source.id, event.target.value as ContextMode)}>
              <option value="off">{t('chat.contextOff')}</option><option value="insights" disabled={!source.insights_count}>{t('common.insights')}</option><option value="full">{t('chat.fullContent')}</option>
            </select>
          </label>)}
          {props.notes.map(note => <label key={note.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">{note.title || note.id}</span>
            <select aria-label={note.title || note.id} className="shrink-0 rounded-md border bg-background p-2" disabled={props.busy || !props.onNoteChange} value={props.selections.notes[note.id] ?? 'off'} onChange={event => props.onNoteChange?.(note.id, event.target.value as NoteContextMode)}>
              <option value="off">{t('chat.contextOff')}</option><option value="full">{t('chat.fullContent')}</option>
            </select>
          </label>)}
        </section>
      </DrawerContent>
    </Dialog>
    <AlertDialog open={confirmation !== null} onOpenChange={open => { if (!open) setConfirmation(null) }}>
      <AlertDialogContent>
        <AlertDialogTitle>{t(confirmation === 'clear' ? 'chat.clearHistory' : 'chat.resetMemory')}</AlertDialogTitle>
        <AlertDialogDescription>{t(confirmation === 'clear' ? 'chat.clearHistoryConfirm' : 'chat.resetMemoryConfirm')}</AlertDialogDescription>
        <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction disabled={disabled} onClick={() => { if (confirmation) props.onMemoryChange(confirmation); setConfirmation(null) }}>{t('common.confirm')}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
