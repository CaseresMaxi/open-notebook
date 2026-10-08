import { useState } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { OpenAnswerInput } from './OpenAnswerInput'
import type { ExamAnswer } from '@/lib/types/exams'
import { hasOpenAnswer } from '@/lib/utils/exam-answers'

function Answer() {
  const [value, setValue] = useState<ExamAnswer>('')
  return <><OpenAnswerInput value={value} onChange={setValue} /><output>{hasOpenAnswer(value) ? 'answered' : 'empty'}</output></>
}

describe('Image answers', () => {
  it('supports image-only answers and removing an attachment', async () => {
    render(<Answer />)
    fireEvent.change(screen.getByLabelText('chat.attachImages', { selector: 'input' }), { target: { files: [new File(['pixels'], 'diagram.png', { type: 'image/png' })] } })
    await screen.findByAltText('diagram.png')
    expect(screen.getByText('answered')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.removeImage' }))
    expect(screen.getByText('empty')).toBeInTheDocument()
  })
  it('keeps text while attaching and supports pasting an image', async () => {
    render(<Answer />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Here is my reasoning' } })
    fireEvent.paste(screen.getByRole('textbox'), { clipboardData: { files: [new File(['pixels'], 'work.png', { type: 'image/png' })] } })
    await screen.findByAltText('work.png')
    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled())
    expect(screen.getByRole('textbox')).toHaveValue('Here is my reasoning')
  })
})
