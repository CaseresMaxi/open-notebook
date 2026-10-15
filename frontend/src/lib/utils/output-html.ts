/**
 * Notebook HTML outputs (mostly pandas tables) come from files and code the
 * student did not necessarily write, so only inert table and text markup is
 * kept: no scripts, styles, links, images, forms or attributes besides spans.
 */
const ALLOWED = new Set([
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'div', 'span', 'p', 'br', 'hr', 'b', 'strong', 'i', 'em', 'u', 'small', 'sub', 'sup',
  'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote',
])
const DROP_WITH_CONTENT = new Set(['script', 'style', 'template', 'iframe', 'object', 'embed', 'svg', 'math', 'noscript', 'textarea', 'select'])
const KEPT_ATTRIBUTES = new Set(['colspan', 'rowspan'])

function clean(node: Node, doc: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent ?? '')
  if (node.nodeType !== Node.ELEMENT_NODE) return null
  const element = node as Element
  const tag = element.tagName.toLowerCase()
  if (DROP_WITH_CONTENT.has(tag)) return null
  const children = Array.from(element.childNodes).map(child => clean(child, doc)).filter((child): child is Node => !!child)
  if (!ALLOWED.has(tag)) {
    // Unknown wrappers keep their text, never their behaviour.
    const fragment = doc.createDocumentFragment()
    children.forEach(child => fragment.appendChild(child))
    return fragment
  }
  const copy = doc.createElement(tag)
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase()
    if (KEPT_ATTRIBUTES.has(name) && /^\d{1,3}$/.test(attribute.value)) copy.setAttribute(name, attribute.value)
  }
  children.forEach(child => copy.appendChild(child))
  return copy
}

export function sanitizeOutputHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const target = document.implementation.createHTMLDocument('')
  const container = target.createElement('div')
  Array.from(parsed.body.childNodes).forEach(child => {
    const cleaned = clean(child, target)
    if (cleaned) container.appendChild(cleaned)
  })
  return container.innerHTML
}
