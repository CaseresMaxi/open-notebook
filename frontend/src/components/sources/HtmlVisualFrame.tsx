'use client'

import { useId, useMemo } from 'react'
import type { HtmlVisual } from '@/lib/types/api'

// The opaque origin also blocks access to the parent, cookies and localStorage.
// CSS/SVG animations work without running generated JavaScript.
const VISUAL_CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'"

export function HtmlVisualFrame({ visual, expanded = false }: { visual: HtmlVisual; expanded?: boolean }) {
  const id = useId()
  const document = useMemo(() => `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${VISUAL_CSP}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{color-scheme:light}body{margin:0;padding:12px;font:16px system-ui;background:Canvas;color:CanvasText;box-sizing:border-box}svg,canvas,img{max-width:100%}*{box-sizing:border-box}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}</style></head><body>${visual.html}</body></html>`, [visual.html])
  return <figure className="w-full space-y-2">
    <iframe title={visual.name} aria-describedby={id} srcDoc={document} sandbox=""
      referrerPolicy="no-referrer" className={`w-full rounded border bg-background ${expanded ? 'h-[75vh]' : 'h-[28rem]'}`} />
    <figcaption id={id} className="text-sm text-muted-foreground">{visual.description}</figcaption>
  </figure>
}
