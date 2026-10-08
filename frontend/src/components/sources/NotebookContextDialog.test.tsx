import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotebookContextDialog } from './NotebookContextDialog'

vi.mock('@/lib/hooks/use-translation', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const setup = (busy = false) => {
  const onMemoryChange = vi.fn()
  const onSourceChange = vi.fn()
  const onExcludeMaterials = vi.fn()
  render(<NotebookContextDialog sources={[{ id: 'source:one', title: 'Trees', insights_count: 1 } as never]} notes={[]} selections={{ sources: { 'source:one': 'full' }, notes: {} }} onSourceChange={onSourceChange} onExcludeMaterials={onExcludeMaterials} memory={{ history_turns: null, total_messages: 8, active_messages: 8, history_tokens: 90 }} materialTokens={120} hasSession busy={busy} onMemoryChange={onMemoryChange} />)
  return { onMemoryChange, onSourceChange, onExcludeMaterials }
}

describe('NotebookContextDialog', () => {
  it('controls history and material selection separately', () => {
    const callbacks = setup()
    fireEvent.click(screen.getByRole('button', { name: 'chat.manageContext' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'chat.rememberTurns' }), { target: { value: '2' } })
    expect(callbacks.onMemoryChange).toHaveBeenCalledWith('limit', 2)
    fireEvent.change(screen.getByRole('combobox', { name: 'Trees' }), { target: { value: 'off' } })
    expect(callbacks.onSourceChange).toHaveBeenCalledWith('source:one', 'off')
    fireEvent.click(screen.getByRole('button', { name: 'chat.excludeMaterials' }))
    expect(callbacks.onExcludeMaterials).toHaveBeenCalledOnce()
  })
  it('requires confirmation before deleting saved history', () => {
    const { onMemoryChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'chat.manageContext' }))
    fireEvent.click(screen.getByRole('button', { name: 'chat.clearHistory' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(onMemoryChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(onMemoryChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'chat.clearHistory' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.confirm' }))
    expect(onMemoryChange).toHaveBeenCalledWith('clear')
  })
  it('disables controls while a chat operation is running', () => {
    setup(true)
    expect(screen.getByRole('button', { name: 'chat.manageContext' })).toBeDisabled()
  })
})
