import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NoteEditorDialog } from './NoteEditorDialog'
import { SUMMARY_MARKER, isStudySummary } from '@/lib/utils/study-summary'
import { useNote } from '@/lib/hooks/use-notes'

// useTranslation is mocked globally in setup.ts (t returns the key string)

const { updateNoteMock } = vi.hoisted(() => ({ updateNoteMock: vi.fn() }))

vi.mock('@/lib/hooks/use-notes', () => ({
  useNote: vi.fn(),
  useCreateNote: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateNote: () => ({ isPending: false, mutateAsync: updateNoteMock }),
}))

vi.mock('@/components/ui/markdown-editor', () => ({
  MarkdownEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea data-testid="markdown-editor" value={value || ''} onChange={event => onChange(event.target.value)} />
  ),
}))

const mockUseNote = vi.mocked(useNote)

const notFoundError = Object.assign(new Error('Request failed with status code 404'), {
  isAxiosError: true,
  response: { status: 404 },
})

const networkError = Object.assign(new Error('Network Error'), {
  isAxiosError: true,
  response: undefined,
})

type UseNoteResult = ReturnType<typeof useNote>

const asResult = (value: Partial<UseNoteResult>) => value as UseNoteResult

function renderDialog(props: Partial<Parameters<typeof NoteEditorDialog>[0]> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <NoteEditorDialog
        open={true}
        onOpenChange={vi.fn()}
        notebookId=""
        note={{ id: 'note-1', title: null, content: null }}
        {...props}
      />
    </QueryClientProvider>
  )
}

describe('NoteEditorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the shared not-found state instead of the editor when the note returns 404', () => {
    mockUseNote.mockReturnValue(
      asResult({ data: undefined, isLoading: false, isError: true, error: notFoundError })
    )

    renderDialog()

    expect(screen.getByTestId('content-unavailable')).toBeInTheDocument()
    expect(screen.getByText('common.contentUnavailable.notFoundTitle')).toBeInTheDocument()
    // The editor is gated: no ghost editing or saving
    expect(screen.queryByTestId('markdown-editor')).not.toBeInTheDocument()
    expect(screen.queryByText('sources.saveNote')).not.toBeInTheDocument()
  })

  it('shows the shared load-error state for non-404 failures', () => {
    mockUseNote.mockReturnValue(
      asResult({ data: undefined, isLoading: false, isError: true, error: networkError })
    )

    renderDialog()

    expect(screen.getByText('common.contentUnavailable.errorTitle')).toBeInTheDocument()
    expect(screen.queryByTestId('markdown-editor')).not.toBeInTheDocument()
  })

  it('closes the dialog from the not-found state close button', () => {
    mockUseNote.mockReturnValue(
      asResult({ data: undefined, isLoading: false, isError: true, error: notFoundError })
    )
    const onOpenChange = vi.fn()

    renderDialog({ onOpenChange })

    within(screen.getByTestId('content-unavailable')).getByText('common.close').click()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opens a loaded note in reading mode and allows editing', () => {
    mockUseNote.mockReturnValue(
      asResult({
        data: {
          id: 'note-1',
          title: 'My note',
          content: 'Note body',
          note_type: 'human',
          created: '2026-01-01T00:00:00Z',
          updated: '2026-01-01T00:00:00Z',
        } as UseNoteResult['data'],
        isLoading: false,
        isError: false,
        error: null,
      })
    )

    renderDialog()

    expect(screen.getByText('Note body')).toBeInTheDocument()
    expect(screen.queryByTestId('markdown-editor')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('common.edit'))
    expect(screen.getByTestId('markdown-editor')).toBeInTheDocument()
    expect(screen.getByText('sources.saveNote')).toBeInTheDocument()
    expect(screen.queryByTestId('content-unavailable')).not.toBeInTheDocument()
    fireEvent.change(screen.getByTestId('markdown-editor'), { target: { value: 'Unsaved draft' } })
    expect(screen.getByRole('region', { name: 'product.preview' })).toHaveTextContent('Unsaved draft')
    fireEvent.click(screen.getByRole('button', { name: 'product.hidePreview' }))
    expect(screen.queryByRole('region', { name: 'product.preview' })).not.toBeInTheDocument()
    expect(screen.getByTestId('markdown-editor')).toHaveValue('Unsaved draft')
    fireEvent.click(screen.getByRole('button', { name: 'product.showPreview' }))
    expect(screen.getByRole('region', { name: 'product.preview' })).toHaveTextContent('Unsaved draft')
    expect(screen.getByTestId('markdown-editor')).toHaveValue('Unsaved draft')
    expect(updateNoteMock).not.toHaveBeenCalled()
  })
})

it('hides summary metadata in the editor and preserves it when the user saves', async () => {
  mockUseNote.mockReturnValue(asResult({ data: { id: 'note-1', title: 'Summary', content: `${SUMMARY_MARKER}\n\nSource-grounded summary`, note_type: 'ai', created: '2026-01-01', updated: '2026-01-01' }, isLoading: false, isError: false }))
  renderDialog({ notebookId: 'notebook:one' })
  fireEvent.click(screen.getByText('common.edit'))
  const editor = screen.getByTestId('markdown-editor')
  expect(editor).toHaveValue('Source-grounded summary')
  fireEvent.change(editor, { target: { value: 'Edited summary with original source' } })
  fireEvent.click(screen.getByText('sources.saveNote'))
  await waitFor(() => expect(updateNoteMock).toHaveBeenCalled())
  const saved = updateNoteMock.mock.calls[0][0].data
  expect(isStudySummary(saved)).toBe(true)
  expect(saved.content).toContain('Edited summary with original source')
})
