'use client'

import { useId, useMemo } from 'react'
import type { HtmlVisual } from '@/lib/types/api'

// The opaque origin also blocks access to the parent, cookies and localStorage.
// Declarative visuals never run code. Scripted ones (inline code the API
// checked for network, navigation and storage use) may run it, but the
// sandbox still omits allow-same-origin, popups and top navigation, and the
// CSP still blocks every request.
const visualCsp = (scripted: boolean) => `default-src 'none'; script-src ${scripted ? "'unsafe-inline'" : "'none'"}; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'`

export function HtmlVisualFrame({ visual, expanded = false }: { visual: HtmlVisual; expanded?: boolean }) {
  const id = useId()
  const scripted = Boolean(visual.scripted)
  const document = useMemo(() => `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${visualCsp(scripted)}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html{color-scheme:light}body{margin:0;padding:12px;font:16px system-ui;background:Canvas;color:CanvasText;box-sizing:border-box}svg,canvas,img{max-width:100%}*{box-sizing:border-box}@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}</style></head><body>${visual.html}</body></html>`, [visual.html, scripted])
  return <figure className="w-full space-y-2">
    <iframe title={visual.name} aria-describedby={id} srcDoc={document} sandbox={scripted ? 'allow-scripts' : ''}
      referrerPolicy="no-referrer" className={`w-full rounded border bg-background ${expanded ? 'h-[75vh]' : 'h-[28rem]'}`} />
    <figcaption id={id} className="text-sm text-muted-foreground">{visual.description}</figcaption>
  </figure>
}
