/** Successful record mutations are the only trigger for product CRUD feedback. */
export const RECORD_MUTATION_EVENT = 'nextnootbook:record-mutation'
export type RecordMutation = { action: 'create' | 'delete'; id: string }

const collections = '(?:notes|notebooks|sources|models|credentials|transformations|exams|exam-attempts|insights|speaker-profiles|episode-profiles|chat/sessions|podcasts/episodes)'
const creationPath = new RegExp(`^/${collections}$|^/sources/[^/]+/chat/sessions$|^/exams/[^/]+/attempts$|^/(?:speaker|episode)-profiles/[^/]+/duplicate$`)
const deletionPath = new RegExp(`^/${collections}/([^/]+)$|^/sources/[^/]+/chat/sessions/([^/]+)$|^/notebooks/[^/]+/sources/([^/]+)$`)

export function recordMutation(method: string | undefined, url: string | undefined, data: unknown): RecordMutation | undefined {
  const path = (url ?? '').split('?')[0].replace(/\/$/, '')
  if (method?.toLowerCase() === 'post' && creationPath.test(path) && data && typeof data === 'object' && 'id' in data && typeof data.id === 'string') {
    return { action: 'create', id: data.id }
  }
  if (method?.toLowerCase() === 'post') {
    const linkedSource = path.match(/^\/notebooks\/[^/]+\/sources\/([^/]+)$/)
    if (linkedSource) return { action: 'create', id: decodeURIComponent(linkedSource[1]) }
    // Background work returns a command, not the final record ID. The listener
    // captures existing identities and animates only new records of this kind.
    if (/^\/sources\/[^/]+\/insights$/.test(path)) return { action: 'create', id: 'source_insight:*' }
    if (path === '/podcasts/generate') return { action: 'create', id: 'episode:*' }
    if (/^\/models\/sync(?:\/[^/]+)?$/.test(path) && data && typeof data === 'object' && (('new' in data && Number(data.new) > 0) || ('total_new' in data && Number(data.total_new) > 0))) return { action: 'create', id: 'model:*' }
    if (/^\/credentials\/[^/]+\/register-models$/.test(path) && data && typeof data === 'object' && 'created' in data && Number(data.created) > 0) return { action: 'create', id: 'model:*' }
  }
  if (method?.toLowerCase() === 'delete') {
    const match = path.match(deletionPath)
    const id = match?.slice(1).find(Boolean)
    if (id) return { action: 'delete', id: decodeURIComponent(id) }
  }
}

export function announceRecordMutation(method: string | undefined, url: string | undefined, data: unknown) {
  if (typeof window === 'undefined') return
  const mutation = recordMutation(method, url, data)
  if (mutation) window.dispatchEvent(new CustomEvent(RECORD_MUTATION_EVENT, { detail: mutation }))
}
