import { describe, expect, it } from 'vitest'
import { summaryContent, SUMMARY_MARKER } from './study-summary'
describe('summary editing', () => {
  it('preserves indentation and trailing whitespace in ordinary notes', () => {
    const markdown = '    code block\n\nText with a line break  \n'
    expect(summaryContent(markdown)).toBe(markdown)
  })
  it('removes only the summary metadata and preserves markdown formatting', () => {
    expect(summaryContent(`${SUMMARY_MARKER}\n\n    code block\n`)).toBe(
      '    code block\n'
    )
  })
})
