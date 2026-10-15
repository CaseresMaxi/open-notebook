import { describe, expect, it } from 'vitest'
import { sanitizeOutputHtml } from './output-html'

describe('sanitizeOutputHtml', () => {
  it('keeps data tables and drops behaviour', () => {
    const html = sanitizeOutputHtml(
      '<style>td{color:red}</style><div class="x" onclick="alert(1)"><table border="1" class="dataframe">' +
      '<tr><th colspan="2" style="color:red">a</th><td onmouseover="x()"><a href="javascript:alert(1)">b</a><img src=x onerror=alert(1)></td></tr>' +
      '</table></div><script>alert(1)</script><iframe src="https://evil"></iframe>'
    )
    expect(html).toBe('<div><table><tbody><tr><th colspan="2">a</th><td>b</td></tr></tbody></table></div>')
  })
})
