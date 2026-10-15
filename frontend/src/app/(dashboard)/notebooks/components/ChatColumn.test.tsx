import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ChatColumn } from './ChatColumn'
import { useNotes } from '@/lib/hooks/use-notes'
import { useNotebookChat } from '@/lib/hooks/use-notebook-chat'
import { useChatFocusStore } from '@/lib/stores/chat-focus-store'
import { resetJupyterSessions, useJupyterSessionStore } from '@/lib/stores/jupyter-session-store'
import type { SourceListResponse } from '@/lib/types/api'
import { fireEvent } from '@testing-library/react'

// Mock the hooks
vi.mock('@/lib/hooks/use-notes')
vi.mock('@/lib/hooks/use-notebook-chat')
vi.mock('@/components/sources/ChatPanel', () => ({
  ChatPanel: ({ composerTop }: { composerTop?: React.ReactNode }) => <div data-testid="chat-panel">{composerTop}</div>
}))

// Type-safe mock factory for useNotes hook
function createNotesMock(overrides: { isLoading?: boolean } = {}) {
  return {
    data: [],
    isLoading: overrides.isLoading ?? false,
  } as unknown as ReturnType<typeof useNotes>
}

// Type-safe mock factory for useNotebookChat hook
function createChatMock() {
  return {
    messages: [],
    isSending: false,
    tokenCount: 0,
    charCount: 0,
    sessions: [],
    currentSessionId: null,
  } as unknown as ReturnType<typeof useNotebookChat>
}

describe('ChatColumn', () => {
  const baseProps = {
    notebookId: 'test-notebook',
    contextSelections: {
      sources: {},
      notes: {}
    },
    sources: [],
  }

  it('shows a conversation skeleton when fetching data', () => {
    vi.mocked(useNotes).mockReturnValue(createNotesMock({ isLoading: true }))
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())

    render(<ChatColumn {...baseProps} sourcesLoading={true} />)

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
  })

  it('renders chat panel when data is loaded', () => {
    vi.mocked(useNotes).mockReturnValue(createNotesMock({ isLoading: false }))
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())

    render(<ChatColumn {...baseProps} sourcesLoading={false} />)

    // Should show chat panel
    expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
  })

  it('reads only the focused sources while the chat is in focus mode', () => {
    resetJupyterSessions()
    vi.mocked(useNotes).mockReturnValue({ data: [{ id: 'note:1' }], isLoading: false } as unknown as ReturnType<typeof useNotes>)
    vi.mocked(useNotebookChat).mockReturnValue(createChatMock())
    const sources = [
      { id: 'source:pdf', title: 'Apunte', insights_count: 2 },
      { id: 'source:nb', title: 'KNN', insights_count: 0, asset: { file_path: '/x/knn.ipynb' } },
    ] as unknown as SourceListResponse[]
    useChatFocusStore.setState({ focus: { 'test-notebook': ['source:nb'] }, request: null, draft: null })
    useJupyterSessionStore.getState().update('source:nb', () => ({
      title: 'KNN', cells: [{ index: 0, id: 'a', type: 'code', source: 'x = 1', execution_count: null, outputs: [] }],
    }))

    render(<ChatColumn {...baseProps} sources={sources} contextSelections={{ sources: { 'source:pdf': 'insights', 'source:nb': 'insights' }, notes: { 'note:1': 'full' } }} sourcesLoading={false} />)

    const params = vi.mocked(useNotebookChat).mock.calls.at(-1)![0]
    // A notebook with a session sends its live state; its saved text would only repeat it.
    expect(params.contextSelections).toEqual({ sources: { 'source:pdf': 'off', 'source:nb': 'insights' }, notes: { 'note:1': 'off' } })
    const focus = params.getFocus?.()
    expect(focus?.source_ids).toEqual(['source:nb'])
    expect(focus?.notebooks[0].cells[0]).toMatchObject({ number: 1, code: 'x = 1' })
    expect(screen.getByRole('group', { name: 'chatFocus.label' })).toHaveTextContent('KNN')

    fireEvent.click(screen.getByRole('button', { name: 'chatFocus.clear' }))
    expect(useChatFocusStore.getState().focus['test-notebook']).toEqual([])
  })
})
