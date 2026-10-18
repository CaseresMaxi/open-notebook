/**
 * @mentions of notebook sources and notes in chat messages.
 * The composer shows "@Title"; the sent message carries "@[Title](source:id)"
 * so the mention survives in the transcript, the backend can name it to the
 * model, and the turn's context includes that document in full.
 */

export type Mentionable = { id: string; title: string; kind: 'source' | 'note' }
export type MentionSegment = { text: string } | { mention: { title: string; id: string } }

const MENTION = /@\[([^\]\n]{1,200})\]\(((?:source|note):[\w-]+)\)/g

const fold = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()

/** Brackets would end the markup early; they are never needed in a label. */
export const mentionLabel = (title: string) => title.replace(/[[\]\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) || 'untitled'

/** The "@query" being typed just before the caret, if any. */
export function activeMention(text: string, caret: number): { query: string; start: number } | null {
  const match = /(^|\s)@([^\s@[\]]{0,40})$/.exec(text.slice(0, caret))
  return match ? { query: match[2], start: caret - match[2].length - 1 } : null
}

export function filterMentionables(items: Mentionable[], query: string, limit = 8): Mentionable[] {
  const needle = fold(query)
  const scored = items
    .map(item => ({ item, at: fold(item.title).indexOf(needle) }))
    .filter(entry => entry.at >= 0)
  // Titles starting with the query first, then by position of the match.
  scored.sort((a, b) => (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1) || a.at - b.at)
  return scored.slice(0, limit).map(entry => entry.item)
}

/** Replace each still-present "@Title" with its markup before sending. */
export function encodeMentions(text: string, mentions: Mentionable[]): string {
  let result = text
  for (const mention of mentions) {
    const label = mentionLabel(mention.title)
    const visible = `@${label}`
    const at = result.indexOf(visible)
    if (at >= 0) result = `${result.slice(0, at)}@[${label}](${mention.id})${result.slice(at + visible.length)}`
  }
  return result
}

export function mentionedIds(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(MENTION), match => match[2]))]
}

export function splitMentions(text: string): MentionSegment[] {
  const segments: MentionSegment[] = []
  let last = 0
  for (const match of text.matchAll(MENTION)) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index) })
    segments.push({ mention: { title: match[1], id: match[2] } })
    last = match.index + match[0].length
  }
  if (last < text.length) segments.push({ text: text.slice(last) })
  return segments
}

/** "@Title" for places that show plain text (copy, previews). */
export const plainMentions = (text: string) => text.replace(MENTION, (_, title: string) => `@${title}`)
