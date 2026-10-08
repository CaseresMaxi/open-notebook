import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

import { MarkdownRenderer } from './markdown-renderer'

describe('MarkdownRenderer', () => {
  it('renders basic markdown', () => {
    const { container } = render(<MarkdownRenderer>{'# Title\n\nSome **bold** text'}</MarkdownRenderer>)
    expect(container.querySelector('h1')?.textContent).toBe('Title')
    expect(container.querySelector('strong')?.textContent).toBe('bold')
  })

  it('highlights fenced code blocks for registered languages', () => {
    const { container } = render(
      <MarkdownRenderer>{'```python\ndef hello():\n    return 42\n```'}</MarkdownRenderer>
    )
    // PrismLight emits token spans when the grammar is registered; a plain
    // fallback would leave the code block without any token markup.
    expect(container.querySelectorAll('span[class*="token"]').length).toBeGreaterThan(0)
  })

  it('falls back to plain text for unknown languages without crashing', () => {
    const { container } = render(
      <MarkdownRenderer>{'```notalanguage\nsome content\n```'}</MarkdownRenderer>
    )
    expect(container.textContent).toContain('some content')
  })

  it('renders rich Markdown cells through the shared Arc table without nested tables', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
    try {
      const { container } = render(<MarkdownRenderer>{'| Concept | Source |\n| --- | --- |\n| **Clustering** | [Read](https://example.com/source) |\n| `K` | Three groups |'}</MarkdownRenderer>)
      expect(container.querySelectorAll('table')).toHaveLength(1)
      expect(container.querySelectorAll('thead th')).toHaveLength(2)
      expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
      expect(container.querySelector('tbody strong')?.textContent).toBe('Clustering')
      expect(container.querySelector('tbody a')?.getAttribute('href')).toBe('https://example.com/source')
      expect(container.querySelector('tbody code')?.textContent).toBe('K')
      expect(container.querySelector('td td')).toBeNull()
    } finally { vi.unstubAllGlobals() }
  })

  it('renders inline code without a highlighter block', () => {
    const { container } = render(<MarkdownRenderer>{'Use `npm ci` here'}</MarkdownRenderer>)
    expect(container.querySelector('code')?.textContent).toBe('npm ci')
    expect(container.querySelectorAll('span[class*="token"]').length).toBe(0)
  })
})
