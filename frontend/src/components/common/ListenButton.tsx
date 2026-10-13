'use client'

import { useSyncExternalStore } from 'react'
import axios from 'axios'
import { Loader2, Square, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getState, play, stop, subscribe } from '@/lib/speech-player'
import { cn } from '@/lib/utils'

async function errorDetail(error: unknown) {
  // Blob responses carry the API's JSON error as a blob.
  if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
    try {
      return JSON.parse(await error.response.data.text()).detail as string | undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Read text aloud with the configured voice model; toggles to stop. */
export function ListenButton({ id, text, className, withLabel = false }: {
  id: string
  text: string
  className?: string
  withLabel?: boolean
}) {
  const { t } = useTranslation()
  const current = useSyncExternalStore(subscribe, getState, getState)
  const active = current.id === id
  const status = active ? current.status : 'idle'
  const label = status === 'loading' ? t('speech.preparing') : status === 'playing' ? t('speech.stop') : t('speech.listen')

  const toggle = async () => {
    if (active) {
      stop()
      return
    }
    try {
      await play(id, text)
    } catch (error) {
      toast.error(t('speech.failed'), { description: await errorDetail(error) })
    }
  }

  const button = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('h-7 px-2', className)}
      onClick={toggle}
      aria-label={label}
      aria-pressed={status === 'playing'}
      disabled={!text.trim()}
    >
      {status === 'loading' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : status === 'playing' ? (
        <Square className="h-3.5 w-3.5 fill-current" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
      {withLabel && <span>{label}</span>}
    </Button>
  )
  if (withLabel) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent><p>{label}</p></TooltipContent>
    </Tooltip>
  )
}
