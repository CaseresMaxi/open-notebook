import { speechApi } from '@/lib/api/speech'

// One narrator for the whole app: starting a new reading stops the previous
// one. Recent audio is kept so replaying an answer does not pay for it again.

type Listener = () => void
export type SpeechState = { id: string | null; status: 'idle' | 'loading' | 'playing' }

const CACHE_LIMIT = 12
const cache = new Map<string, string>()
const listeners = new Set<Listener>()
let state: SpeechState = { id: null, status: 'idle' }
let audio: HTMLAudioElement | null = null
let pending: AbortController | null = null

function set(next: SpeechState) {
  state = next
  listeners.forEach((listener) => listener())
}

export function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function getState() {
  return state
}

export function stop() {
  pending?.abort()
  pending = null
  if (audio) {
    audio.pause()
    audio = null
  }
  set({ id: null, status: 'idle' })
}

async function audioUrl(text: string, signal: AbortSignal) {
  const cached = cache.get(text)
  if (cached) return cached
  const url = URL.createObjectURL(await speechApi.synthesize(text, signal))
  cache.set(text, url)
  if (cache.size > CACHE_LIMIT) {
    const [oldest, oldUrl] = cache.entries().next().value as [string, string]
    cache.delete(oldest)
    URL.revokeObjectURL(oldUrl)
  }
  return url
}

/** Read `text` aloud under `id`; resolves when playback starts. */
export async function play(id: string, text: string) {
  stop()
  const controller = new AbortController()
  pending = controller
  set({ id, status: 'loading' })
  try {
    const url = await audioUrl(text, controller.signal)
    if (controller.signal.aborted) return
    pending = null
    const element = new Audio(url)
    audio = element
    element.onended = () => { if (audio === element) stop() }
    element.onerror = () => { if (audio === element) stop() }
    await element.play()
    set({ id, status: 'playing' })
  } catch (error) {
    if (controller.signal.aborted) return
    stop()
    throw error
  }
}
