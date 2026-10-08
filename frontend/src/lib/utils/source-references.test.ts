import { expect, it } from 'vitest'
import { convertReferencesToCompactMarkdown } from './source-references'

it('keeps citation targets while displaying localized numbered reference labels', () => {
  const result = convertReferencesToCompactMarkdown('See [source:abc] and [note:def]. Again [source:abc].', 'Referencias')
  expect(result).toContain('See [1](#ref-source-abc) and [2](#ref-note-def). Again [1](#ref-source-abc).')
  expect(result).toContain('[Referencias 1](#ref-source-abc)')
  expect(result).toContain('[Referencias 2](#ref-note-def)')
  expect(result).not.toContain('[source:abc]')
  expect(result).not.toContain('[note:def]')
})
