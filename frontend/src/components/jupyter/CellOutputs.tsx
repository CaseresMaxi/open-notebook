'use client'

import { useMemo } from 'react'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { NotebookOutput } from '@/lib/types/jupyter'
import { sanitizeOutputHtml } from '@/lib/utils/output-html'

const IMAGE_ORDER = ['image/png', 'image/jpeg', 'image/svg+xml'] as const

function HtmlOutput({ html }: { html: string }) {
  const safe = useMemo(() => sanitizeOutputHtml(html), [html])
  return <div className="jnb-html" dangerouslySetInnerHTML={{ __html: safe }} />
}

function imageSource(mime: string, data: string) {
  return mime === 'image/svg+xml'
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`
    : `data:${mime};base64,${data}`
}

function DisplayOutput({ data, alt }: { data: Record<string, string>; alt: string }) {
  const image = IMAGE_ORDER.find(mime => data[mime])
  // An <img> never runs scripts, so SVG is safe here; data URLs bypass next/image.
  // eslint-disable-next-line @next/next/no-img-element
  if (image) return <img className="jnb-figure" src={imageSource(image, data[image])} alt={alt} loading="lazy" />
  // Only data tables keep their HTML: widget-like reprs (scikit-learn estimators)
  // depend on scripts and styles that are stripped, so their text reads better.
  if (data['text/html'] && (/class="dataframe/.test(data['text/html']) || !/<(style|script)\b/i.test(data['text/html']) || !data['text/plain'])) {
    return <HtmlOutput html={data['text/html']} />
  }
  if (data['text/markdown']) return <MarkdownRenderer>{data['text/markdown']}</MarkdownRenderer>
  const text = data['text/latex'] ?? data['text/plain']
  return text ? <pre className="jnb-text">{text}</pre> : null
}

/** Outputs of one code cell, in the order the code produced them. */
export function CellOutputs({ outputs, cellNumber }: { outputs: NotebookOutput[]; cellNumber: number }) {
  const { t } = useTranslation()
  // Consecutive stream chunks read as one block, like in Jupyter.
  const merged = useMemo(() => outputs.reduce<NotebookOutput[]>((list, output) => {
    const last = list[list.length - 1]
    if (output.type === 'stream' && last?.type === 'stream' && last.name === output.name) {
      list[list.length - 1] = { ...last, text: last.text + output.text }
    } else list.push(output)
    return list
  }, []), [outputs])
  if (!merged.length) return null
  return (
    <div className="jnb-outputs" aria-label={t('jupyter.output')}>
      {merged.map((output, index) => {
        if (output.type === 'stream') {
          return <pre key={index} className={output.name === 'stderr' ? 'jnb-text jnb-stderr' : 'jnb-text'}>{output.text}</pre>
        }
        if (output.type === 'error') {
          return (
            <pre key={index} className="jnb-text jnb-error" role="alert">
              {output.traceback || `${output.ename}: ${output.evalue}`}
            </pre>
          )
        }
        return <DisplayOutput key={index} data={output.data} alt={t('jupyter.figureAlt', { n: cellNumber })} />
      })}
    </div>
  )
}

/** Short text version of outputs, for the tutor (mirrors the API's output_text). */
export function outputsText(outputs: NotebookOutput[], limit = 6000): string {
  const parts = outputs.map(output => {
    if (output.type === 'stream') return output.text
    if (output.type === 'error') return `${output.ename}: ${output.evalue}`
    if (output.data['text/plain'] && !output.data['image/png']) return output.data['text/plain']
    return Object.keys(output.data).some(mime => mime.startsWith('image/')) ? '[figure]' : ''
  })
  const text = parts.map(part => part.trim()).filter(Boolean).join('\n')
  return text.length > limit ? `${text.slice(0, limit)}\n…` : text
}
