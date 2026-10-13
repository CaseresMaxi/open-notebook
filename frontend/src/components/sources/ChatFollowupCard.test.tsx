import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatFollowupCard } from './ChatFollowupCard'

describe('ChatFollowupCard', () => {
  it('starts an in-chat test with an internal, hidden turn', () => {
    const onReply = vi.fn()
    render(<ChatFollowupCard followup={{ kind: 'study' } as never} onReply={onReply} onCreateExam={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'chat.testInChat' }))
    expect(onReply).toHaveBeenCalledWith('chat.inlineTestReply', { hidden: true })
  })

  it('keeps explicit answer options as visible replies', () => {
    const onReply = vi.fn()
    render(<ChatFollowupCard followup={{ kind: 'question', question: 'Q', options: [{ label: 'A', message: 'Opción A' }] } as never} onReply={onReply} />)
    fireEvent.click(screen.getByRole('button', { name: 'A' }))
    expect(onReply).toHaveBeenCalledWith('Opción A', undefined)
  })
})
