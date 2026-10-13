import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { NotebookList } from './NotebookList'

describe('NotebookList loading states', () => {
  it('shows a skeleton instead of the empty state on first load', () => {
    render(<NotebookList isLoading title="Notebooks" />)
    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument()
    expect(screen.queryByText('common.noResults')).not.toBeInTheDocument()
  })

  it('shows a retryable error instead of claiming there are no notebooks', () => {
    const onRetry = vi.fn()
    render(<NotebookList isLoading={false} isError onRetry={onRetry} title="Notebooks" />)
    expect(screen.getByRole('alert')).toHaveTextContent('common.loadFailed')
    expect(screen.queryByText('common.noResults')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('keeps the empty state for a loaded empty list', () => {
    render(<NotebookList notebooks={[]} isLoading={false} title="Notebooks" />)
    expect(screen.getByText('common.noResults')).toBeInTheDocument()
  })
})
