import { create } from 'zustand'

/**
 * Sources the notebook chat concentrates on. While a notebook has a focus, the
 * chat reads only those sources (in full) and answers about them. Kept per
 * notebook for this tab; it is a working mode, not a saved setting.
 */
interface ChatFocusState {
  focus: Record<string, string[]>
  /** Asks the notebook page to show its chat (set when focusing from elsewhere). */
  request: { notebookId: string; at: number } | null
  /** Text to place in the chat composer, e.g. a question about one cell. */
  draft: { notebookId: string; text: string; at: number } | null
  focusSource: (notebookId: string, sourceId: string, draft?: string) => void
  unfocus: (notebookId: string, sourceId: string) => void
  clear: (notebookId: string) => void
  takeDraft: (notebookId: string) => string | null
}

export const useChatFocusStore = create<ChatFocusState>()((set, get) => ({
  focus: {},
  request: null,
  draft: null,
  focusSource: (notebookId, sourceId, draft) => set(state => {
    const current = state.focus[notebookId] ?? []
    return {
      focus: { ...state.focus, [notebookId]: current.includes(sourceId) ? current : [...current, sourceId] },
      request: { notebookId, at: Date.now() },
      draft: draft ? { notebookId, text: draft, at: Date.now() } : state.draft,
    }
  }),
  unfocus: (notebookId, sourceId) => set(state => ({
    focus: { ...state.focus, [notebookId]: (state.focus[notebookId] ?? []).filter(id => id !== sourceId) },
  })),
  clear: notebookId => set(state => ({ focus: { ...state.focus, [notebookId]: [] } })),
  takeDraft: notebookId => {
    const draft = get().draft
    if (!draft || draft.notebookId !== notebookId) return null
    set({ draft: null })
    return draft.text
  },
}))

const NO_FOCUS: string[] = []

export function useFocusedSources(notebookId: string | null | undefined): string[] {
  return useChatFocusStore(state => (notebookId ? state.focus[notebookId] : undefined) ?? NO_FOCUS)
}
