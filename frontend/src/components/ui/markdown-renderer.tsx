'use client'

import { MarkdownDataTable } from '@/components/ui/study-data-table'
import dynamic from 'next/dynamic'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

import { useThemeStore } from '@/lib/stores/theme-store'
import { KATEX_OPTIONS } from '@/lib/utils/katex-options'
import { oneDark as darkTheme } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight as lightTheme } from 'react-syntax-highlighter/dist/esm/styles/prism'
// PrismLight with an explicit language set instead of the full Prism build:
// bundling every refractor grammar costs ~600KB of client JS. Unregistered
// languages fall back to unhighlighted text.
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff'
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import r from 'react-syntax-highlighter/dist/esm/languages/prism/r'
import ruby from 'react-syntax-highlighter/dist/esm/languages/prism/ruby'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import swift from 'react-syntax-highlighter/dist/esm/languages/prism/swift'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'

import type {ExtraProps} from 'react-markdown'
import {createContext, useContext, type ComponentProps, type ElementType, type ReactNode} from 'react'

/** An action offered under code blocks, e.g. "Add to notebook" in a focused chat. */
export interface CodeBlockAction {
  languages: string[]
  label: string
  icon?: ReactNode
  onAction: (code: string) => void
}

export const CodeBlockActionContext = createContext<CodeBlockAction | null>(null)

const LANGUAGES = {
  bash, c, cpp, csharp, css, diff, docker, go, java, javascript, json, jsx,
  kotlin, markdown, markup, php, python, r, ruby, rust, sql, swift, tsx,
  typescript, yaml,
}
for (const [name, language] of Object.entries(LANGUAGES)) {
  SyntaxHighlighter.registerLanguage(name, language)
}

// Interactive Arc components in answers load on first use, keeping the chart
// code out of pages that never show one.
const ArcBlock = dynamic(() => import('@/components/chat/ArcBlock'), {
  ssr: false,
  loading: () => <div className="arc-block arc-block-loading" aria-hidden="true" />,
})

type Components = {
  [Key in Extract<ElementType, string>]?: ElementType<ComponentProps<Key> & ExtraProps>
}

export function MarkdownRenderer({ children, components = {}}: { children: React.ReactNode , components?: Components }) {

  const { getEffectiveTheme } = useThemeStore()
  const isDark = getEffectiveTheme() === 'dark'
  const codeAction = useContext(CodeBlockActionContext)

  return (
    <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none break-words prose-headings:font-semibold prose-a:text-primary prose-a:break-all prose-code:before:content-none prose-code:after:content-none prose-pre:p-0 prose-pre:bg-transparent prose-p:mb-4 prose-p:leading-7 prose-li:mb-2">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[[rehypeKatex, KATEX_OPTIONS]]}
          components={{...{
            p: ({ children }) => <p className="mb-4">{children}</p>,
            h1: ({ children }) => <h1 className="mb-4 mt-6">{children}</h1>,
            h2: ({ children }) => <h2 className="mb-3 mt-5">{children}</h2>,
            h3: ({ children }) => <h3 className="mb-3 mt-4">{children}</h3>,
            h4: ({ children }) => <h4 className="mb-2 mt-4">{children}</h4>,
            h5: ({ children }) => <h5 className="mb-2 mt-3">{children}</h5>,
            h6: ({ children }) => <h6 className="mb-2 mt-3">{children}</h6>,
            li: ({ children }) => <li className="mb-1">{children}</li>,
            ul: ({ children }) => <ul className="mb-4 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="mb-4 space-y-1">{children}</ol>,
            table: ({ children }) => <MarkdownDataTable>{children}</MarkdownDataTable>,
            thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
            th: ({ children }) => <th className="border border-border px-3 py-2 text-left font-semibold">{children}</th>,
            td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
            pre: ({ children, node }) => {
              const code = node?.children?.[0]
              const classes = code && 'properties' in code ? code.properties?.className : undefined
              return Array.isArray(classes) && classes.includes('language-arc') ? <>{children}</> : <pre>{children}</pre>
            },
            code: ({ children, className }) => {
              const match = /language-(\w+)/.exec(className || '')
              if (match?.[1] === 'arc') return <ArcBlock source={String(children).trim()} />
              const isBlock = match || String(children).includes('\n')
              const highlighted = (
                <SyntaxHighlighter
                  language={match ? match[1] : 'text'}
                  style={isDark ? darkTheme : lightTheme}
                  PreTag="div"
                  className="text-sm border border-border"
                >
                  {String(children)}
                </SyntaxHighlighter>
              )
              if (!isBlock) return <code className="bg-border rounded px-1 py-0.5">{children}</code>
              if (!codeAction || !match || !codeAction.languages.includes(match[1].toLowerCase())) return highlighted
              const code = String(children).replace(/\n$/, '')
              return (
                <div className="code-block-action">
                  {highlighted}
                  <button type="button" className="code-block-action-button" onClick={() => codeAction.onAction(code)}>
                    {codeAction.icon}{codeAction.label}
                  </button>
                </div>
              )
            },
          }, ...components}}
        >
          {String(children)}
        </ReactMarkdown>
      </div>
  )
}
