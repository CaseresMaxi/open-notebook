/**
 * Documents attached in the chat composer. Each file becomes a notebook
 * source through the normal upload pipeline; once processed, the message
 * @mentions it so the turn receives the whole document.
 */
import { sourcesApi } from '@/lib/api/sources'
import { CHAT_IMAGE_TYPES } from './chat-images'
import { mentionedIds, mentionLabel } from './chat-mentions'

export type ChatDocumentStatus = 'uploading' | 'processing' | 'ready' | 'failed'
export type ChatDocument = { key: string; name: string; status: ChatDocumentStatus; sourceId?: string }

export const isChatImage = (file: File) => CHAT_IMAGE_TYPES.includes(file.type)

export const documentPending = (document: ChatDocument) => document.status === 'uploading' || document.status === 'processing'

/** Resolves once the source's processing command finishes; rejects if it fails or never ends. */
export async function waitForSource(
  id: string,
  { interval = 2000, timeout = 10 * 60_000, signal }: { interval?: number; timeout?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const deadline = Date.now() + timeout
  for (;;) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const { status } = await sourcesApi.status(id)
      // Sources without a command (legacy) are already complete.
      if (!status || status === 'completed') return
      if (status === 'failed') throw new Error('chat.documentFailed')
    } catch (error) {
      if (error instanceof Error && error.message === 'chat.documentFailed') throw error
      // A failed status poll is transient; keep waiting until the deadline.
    }
    if (Date.now() > deadline) throw new Error('chat.documentTimeout')
    await new Promise(resolve => setTimeout(resolve, interval))
  }
}

/** Append a mention for each ready document the text does not mention yet. */
export function withDocumentMentions(text: string, documents: ChatDocument[]): string {
  const present = new Set(mentionedIds(text))
  const added = documents
    .filter(document => document.status === 'ready' && document.sourceId && !present.has(document.sourceId))
    .map(document => `@[${mentionLabel(document.name)}](${document.sourceId})`)
  if (!added.length) return text
  return text ? `${text}\n\n${added.join(' ')}` : added.join(' ')
}
