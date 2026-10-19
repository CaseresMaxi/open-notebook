'use client'

import { type ReactNode, memo, useCallback, useState, useRef, useEffect, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LiquidSurface } from '@/components/layout/LiquidSurface'
import { ChatCodeRunner, RUNNABLE_LANGUAGES, type CodeNotebook } from '@/components/chat/ChatCodeRunner'
import { CodeBlockExtrasContext, type CodeBlockExtras } from '@/components/ui/markdown-renderer'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/arc/drawer/drawer'
import { useDevelopmentTools } from '@/lib/hooks/use-development-tools'
import { Bot, User, Send, Loader2, Clock, ImagePlus, Paperclip, FileText, StickyNote, X, AlertCircle } from 'lucide-react'
import {
  SourceChatMessage,
  SourceChatContextIndicator,
  BaseChatSession,
  ChatImage
} from '@/lib/types/api'
import { ModelSelector } from './ModelSelector'
import { SessionManager } from '@/components/sources/SessionManager'
import { MessageActions } from '@/components/sources/MessageActions'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'
import { CreateExamDialog } from '@/app/(dashboard)/exams/components/CreateExamDialog'
import { ChatImages } from './ChatImages'
import { ChatResponseContent } from './ChatResponseContent'
import { replaceArcBlocksWithMarkdown } from '@/lib/utils/arc-blocks'
import { readChatImages, CHAT_IMAGE_TYPES } from '@/lib/utils/chat-images'
import { activeMention, encodeMentions, filterMentionables, mentionLabel, splitMentions, type Mentionable } from '@/lib/utils/chat-mentions'
import { documentPending, isChatImage, waitForSource, withDocumentMentions, type ChatDocument } from '@/lib/utils/chat-attachments'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { ChatSkeleton } from '@/components/common/LoadingSkeletons'

type SendChatMessage = (message: string, modelOverride?: string, images?: ChatImage[], visualTools?: boolean, options?: { hidden?: boolean }) => void | boolean | Promise<void | boolean>
const DOCUMENT_STATUS = {
  uploading: 'chat.document_uploading',
  processing: 'chat.document_processing',
  ready: 'chat.document_ready',
  failed: 'chat.document_failed',
} as const
// Turns a file attached in the composer into a notebook source; detaching removes it again.
export type ChatDocumentHandlers = {
  attach: (file: File) => Promise<{ id: string }>
  detach: (id: string) => void | Promise<void>
}

interface NotebookContextStats {
  sourcesInsights: number
  sourcesFull: number
  notesCount: number
  tokenCount?: number
  charCount?: number
}

interface ChatPanelProps {
  headerActions?: ReactNode
  messages: SourceChatMessage[]
  isStreaming: boolean
  contextIndicators: SourceChatContextIndicator | null
  onSendMessage: SendChatMessage
  modelOverride?: string
  onModelChange?: (model?: string) => void
  // Session management props
  sessions?: BaseChatSession[]
  currentSessionId?: string | null
  onCreateSession?: (title: string) => void
  onSelectSession?: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
  onUpdateSession?: (sessionId: string, title: string) => void
  loadingSessions?: boolean
  // An existing transcript is still loading: never show the empty prompt yet
  loadingMessages?: boolean
  // Generic props for reusability
  title?: string
  contextType?: 'source' | 'notebook'
  // Notebook context stats (for notebook chat)
  notebookContextStats?: NotebookContextStats
  // Notebook ID for saving notes
  notebookId?: string
  // Shown just above the composer (e.g. the sources the chat is focused on)
  composerTop?: ReactNode
  // Sources and notes the composer can @mention
  mentionables?: Mentionable[]
  documents?: ChatDocumentHandlers
  // Text to place in the composer once (e.g. a question about a notebook cell)
  draft?: { text: string; at: number } | null
  onDraftUsed?: () => void
  // A focused Jupyter notebook: Python blocks run in its session and can be added to it
  codeNotebook?: CodeNotebook | null
}

export function ChatPanel({
  headerActions,
  messages,
  isStreaming,
  onSendMessage,
  modelOverride,
  onModelChange,
  sessions = [],
  currentSessionId,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onUpdateSession,
  loadingSessions = false,
  loadingMessages = false,
  title,
  contextType = 'source',
  notebookId,
  composerTop,
  mentionables,
  documents,
  draft,
  onDraftUsed,
  codeNotebook
}: ChatPanelProps) {
  const developerTools = useDevelopmentTools()
  const [examRequest, setExamRequest] = useState<string | null>(null)
  const { t } = useTranslation()
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { openModal } = useModalManager()
  // Python blocks in answers run in the browser, in a session per chat.
  const codeSessionKey = `chat:${notebookId ?? contextType}`
  const codeExtras = useCallback<CodeBlockExtras>((code, language) => RUNNABLE_LANGUAGES.has(language)
    ? <ChatCodeRunner code={code} sessionKey={codeSessionKey} notebook={codeNotebook} />
    : null, [codeSessionKey, codeNotebook])

  // Stable reference-click handler so memoized messages don't re-render on
  // composer keystrokes (which no longer re-render this component at all, since
  // the input state lives in the ChatComposer child).
  const handleReferenceClick = useCallback((type: string, id: string) => {
    const modalType = type === 'source_insight' ? 'insight' : type as 'source' | 'note' | 'insight'

    try {
      openModal(modalType, id)
      // Note: The modal system uses URL parameters and doesn't throw errors for missing items.
      // The modal component itself will handle displaying "not found" states.
      // This try-catch is here for future enhancements or unexpected errors.
    } catch {
      toast.error(t('common.noResults'))
    }
  }, [openModal, t])

  // Follow the conversation only while the reader is near its end.
  // Scroll the message viewport itself, never its outer page or dialog.
  const followMessages = useRef(true)
  const conversationStart = useRef<string | undefined>(undefined)
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
    if (!viewport) return
    const onScroll = () => {
      followMessages.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96
    }
    viewport.addEventListener('scroll', onScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
    const first = messages[0]?.id
    if (first !== conversationStart.current) followMessages.current = true
    conversationStart.current = first
    if (viewport && followMessages.current) viewport.scrollTop = viewport.scrollHeight
  }, [messages])

  return (
    <CodeBlockExtrasContext.Provider value={codeExtras}>
    {examRequest !== null && <CreateExamDialog open onOpenChange={open => { if (!open) setExamRequest(null) }} initialNotebookId={notebookId} initialInstructions={examRequest || ''} initialModelId={modelOverride} />}
    <Card className="study-conversation relative py-0 flex flex-col h-full min-h-0 flex-1 overflow-hidden">
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 study-column-heading text-sm font-medium">
            <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-teal" />
            {title || (contextType === 'source' ? t('chat.chatWith', { name: t('navigation.sources') }) : t('chat.chatWith', { name: t('common.notebook') }))}
          </CardTitle>
          <div className="ml-auto flex shrink-0 items-center gap-1">
          {developerTools && headerActions}
          {onSelectSession && onCreateSession && onDeleteSession && (
            <Drawer open={sessionManagerOpen} onOpenChange={setSessionManagerOpen}>
              <LiquidSurface className="chat-session-control" radius={16}><DrawerTrigger asChild><Button
                variant="ghost"
                size="sm"
                aria-label={t('chat.sessions')}
                  className="gap-2 text-muted-foreground"
                onClick={() => setSessionManagerOpen(true)}
                disabled={loadingSessions || isStreaming}
              >
                <Clock className="h-4 w-4" />
                <span className="text-xs">{t('chat.sessions')}</span>
              </Button></DrawerTrigger></LiquidSurface>
              <DrawerContent closeLabel={t('common.close')} className="product-shell" title={t('chat.sessionsTitle')}>
                <SessionManager embedded
                  sessions={sessions}
                  currentSessionId={currentSessionId ?? null}
                  onCreateSession={(title) => onCreateSession?.(title)}
                  onSelectSession={(sessionId) => {
                    onSelectSession(sessionId)
                    setSessionManagerOpen(false)
                  }}
                  onUpdateSession={(sessionId, title) => onUpdateSession?.(sessionId, title)}
                  onDeleteSession={(sessionId) => onDeleteSession?.(sessionId)}
                  loadingSessions={loadingSessions}
                />
              </DrawerContent>
            </Drawer>
          )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 p-0">
        <ScrollArea className="flex-1 min-h-0 px-4" ref={scrollAreaRef}>
          <div className="chat-transcript space-y-4 py-4">
            {messages.length === 0 && loadingMessages ? (
              <ChatSkeleton />
            ) : messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">
                  {t('chat.startConversation', { type: contextType === 'source' ? t('navigation.sources') : t('common.notebook') })}
                </p>
                <p className="text-xs mt-2">{t('chat.askQuestions')}</p>
              </div>
            ) : (
              messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  notebookId={notebookId}
                  onReferenceClick={handleReferenceClick}
                  followupsDisabled={isStreaming || message.id !== messages[messages.length - 1]?.id}
                  onReply={(text, options) => onSendMessage(text, modelOverride, undefined, true, options)}
                  onCreateExam={() => {
                    const position = messages.findIndex(item => item.id === message.id)
                    const request = messages.slice(0, position).reverse().find(item => item.type === 'human')
                    setExamRequest(request?.content || '')
                  }}
                />
              ))
            )}
            {isStreaming && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-teal-tint flex items-center justify-center">
                    <Bot className="h-4 w-4 text-teal" />
                  </div>
                </div>
                <div className="rounded-lg px-4 py-2 bg-card border">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <ChatComposer
          onSendMessage={onSendMessage}
          isStreaming={isStreaming}
          modelOverride={modelOverride}
          onModelChange={onModelChange}
          top={composerTop}
          draft={draft}
          onDraftUsed={onDraftUsed}
          mentionables={mentionables}
          documentHandlers={documents}
        />
      </CardContent>
    </Card>

    </CodeBlockExtrasContext.Provider>
  )
}

// Composer owns the input state so keystrokes (including IME composition) only
// re-render this small component instead of the whole message history.
interface ChatComposerProps {
  onSendMessage: SendChatMessage
  isStreaming: boolean
  modelOverride?: string
  onModelChange?: (model?: string) => void
  top?: ReactNode
  draft?: { text: string; at: number } | null
  onDraftUsed?: () => void
  mentionables?: Mentionable[]
  documentHandlers?: ChatDocumentHandlers
}

function ChatComposer({
  onSendMessage,
  isStreaming,
  modelOverride,
  onModelChange,
  top,
  draft,
  onDraftUsed,
  mentionables,
  documentHandlers
}: ChatComposerProps) {
  const { t } = useTranslation()
  const developerTools = useDevelopmentTools()
  const chatInputId = useId()
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [images, setImages] = useState<ChatImage[]>([])
  const [visualTools, setVisualTools] = useState(true)
  const [readingImages, setReadingImages] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [mentions, setMentions] = useState<Mentionable[]>([])
  const [mentionQuery, setMentionQuery] = useState<{ query: string; start: number } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [documents, setDocuments] = useState<ChatDocument[]>([])
  // Sending while a document is still processing queues the message until it is ready.
  const [queued, setQueued] = useState(false)
  const documentsPending = documents.some(documentPending)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])
  const mentionListId = useId()
  const mentionOptions = mentionQuery && mentionables?.length ? filterMentionables(mentionables, mentionQuery.query) : []
  const mentionOpen = mentionOptions.length > 0
  const fileInputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const composer = composerRef.current
    const conversation = composer?.closest<HTMLElement>('.study-conversation')
    if (!composer || !conversation) return
    const measure = () => conversation.style.setProperty('--composer-height', `${composer.getBoundingClientRect().height}px`)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(composer)
    return () => observer.disconnect()
  }, [])
  const readingRef = useRef(false)
  const busy = isStreaming || readingImages || submitting || queued
  useEffect(() => {
    if (!draft) return
    setInput(previous => (previous.trim() ? `${previous.trimEnd()}\n${draft.text}` : draft.text))
    onDraftUsed?.()
    const frame = requestAnimationFrame(() => {
      const field = document.getElementById(chatInputId) as HTMLTextAreaElement | null
      field?.focus()
      field?.setSelectionRange(field.value.length, field.value.length)
    })
    return () => cancelAnimationFrame(frame)
  }, [draft, onDraftUsed, chatInputId])

  const addImages = async (files: File[]) => {
    if (busy || readingRef.current || !files.length) return
    readingRef.current = true
    setReadingImages(true)
    try {
      const added = await readChatImages(files, images.length)
      setImages(previous => [...previous, ...added])
    } catch (error) {
      toast.error(t(error instanceof Error ? error.message : 'chat.imageReadFailed'))
    } finally {
      readingRef.current = false
      setReadingImages(false)
    }
  }

  const updateDocument = (key: string, change: Partial<ChatDocument>) =>
    setDocuments(previous => previous.map(document => (document.key === key ? { ...document, ...change } : document)))

  const attachDocument = async (file: File) => {
    if (!documentHandlers) return
    abortRef.current ??= new AbortController()
    const signal = abortRef.current.signal
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setDocuments(previous => [...previous, { key, name: file.name, status: 'uploading' }])
    try {
      const { id } = await documentHandlers.attach(file)
      updateDocument(key, { sourceId: id, status: 'processing' })
      await waitForSource(id, { signal })
      updateDocument(key, { status: 'ready' })
    } catch (error) {
      if (signal.aborted) return
      updateDocument(key, { status: 'failed' })
      const message = error instanceof Error && error.message.startsWith('chat.') ? t(error.message) : getApiErrorMessage(error, code => t(code), t('chat.documentFailed'))
      toast.error(`${file.name}: ${message}`)
    }
  }

  const removeDocument = (document: ChatDocument) => {
    setDocuments(previous => previous.filter(item => item.key !== document.key))
    // The file was uploaded only for this message; unsent, it leaves the notebook too.
    if (document.sourceId) void Promise.resolve(documentHandlers?.detach(document.sourceId)).catch(() => undefined)
  }

  const addFiles = (files: File[]) => {
    if (busy || !files.length) return
    const images = documentHandlers ? files.filter(isChatImage) : files
    if (images.length) void addImages(images)
    if (documentHandlers) for (const file of files.filter(file => !isChatImage(file))) void attachDocument(file)
  }

  const updateMention = (field: HTMLTextAreaElement) => {
    setMentionQuery(mentionables?.length ? activeMention(field.value, field.selectionStart ?? field.value.length) : null)
    setMentionIndex(0)
  }

  const chooseMention = (item: Mentionable) => {
    const field = document.getElementById(chatInputId) as HTMLTextAreaElement | null
    if (!mentionQuery || !field) return
    const caret = field.selectionStart ?? input.length
    const inserted = `@${mentionLabel(item.title)} `
    const next = input.slice(0, mentionQuery.start) + inserted + input.slice(caret)
    setInput(next)
    setMentions(previous => (previous.some(mention => mention.id === item.id) ? previous : [...previous, item]))
    setMentionQuery(null)
    const position = mentionQuery.start + inserted.length
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(position, position) })
  }

  const readyDocuments = documents.filter(document => document.status === 'ready')
  const canSend = !!input.trim() || images.length > 0 || documents.some(document => document.status !== 'failed')

  const handleSend = () => {
    if (!canSend || busy || readingRef.current) return
    if (documentsPending) {
      setQueued(true)
      return
    }
    if (!input.trim() && !images.length && !readyDocuments.length) return
    const clearDraft = (success: void | boolean) => {
      if (success !== false) {
        setInput('')
        setImages([])
        setDocuments([])
        setMentions([])
        setMentionQuery(null)
      }
    }
    const message = withDocumentMentions(encodeMentions(input.trim(), mentions), readyDocuments)
    const result = onSendMessage(message, modelOverride, images, visualTools)
    if (result instanceof Promise) {
      setSubmitting(true)
      result.then(clearDraft).catch(() => {
        toast.error(t('apiErrors.failedToSendMessage'))
      }).finally(() => setSubmitting(false))
    } else {
      clearDraft(result)
    }
  }

  const sendRef = useRef(handleSend)
  sendRef.current = handleSend
  useEffect(() => {
    if (!queued || documentsPending) return
    setQueued(false)
    // The queued send runs with the documents' final state.
    requestAnimationFrame(() => sendRef.current())
  }, [queued, documentsPending])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (mentionOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setMentionIndex(index => (index + step + mentionOptions.length) % mentionOptions.length)
        return
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault()
        chooseMention(mentionOptions[Math.min(mentionIndex, mentionOptions.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionQuery(null)
        return
      }
    }
    // Detect platform for correct modifier key
    const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0
    const isModifierPressed = isMac ? e.metaKey : e.ctrlKey

    if (e.key === 'Enter' && isModifierPressed) {
      e.preventDefault()
      handleSend()
    }
  }



  return (
    <div ref={composerRef} className="chat-composer flex-shrink-0 p-4 space-y-3"
      onDragOver={event => event.preventDefault()}
      onDrop={event => {
        event.preventDefault()
        addFiles(Array.from(event.dataTransfer.files))
      }}>
      {top}
      {developerTools && <Drawer open={optionsOpen} onOpenChange={setOptionsOpen}>
        <DrawerTrigger asChild><Button variant="ghost" size="sm">{t('navigation.advanced')}</Button></DrawerTrigger>
        <DrawerContent closeLabel={t('common.close')} className="product-shell" title={t('navigation.advanced')}>
      {/* Model selector */}
      {onModelChange && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{t('chat.model')}</span>
          <ModelSelector
            currentModel={modelOverride}
            onModelChange={onModelChange}
            disabled={busy}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm mt-3">
        <input type="checkbox" checked={visualTools} disabled={busy} onChange={event => setVisualTools(event.target.checked)} />
        {t('chat.visualResponses')}
      </label>
      {visualTools && <p className="text-xs text-muted-foreground mt-2">{t('chat.visualResponsesHint')}</p>}
      </DrawerContent></Drawer>}
      {mentionOpen && <ul id={mentionListId} role="listbox" aria-label={t('chat.mentionList')} className="chat-mention-menu">
        {mentionOptions.map((item, index) => <li key={item.id} id={`${mentionListId}-${index}`} role="option" aria-selected={index === mentionIndex}
          className="chat-mention-option" onMouseDown={event => { event.preventDefault(); chooseMention(item) }} onMouseEnter={() => setMentionIndex(index)}>
          {item.kind === 'note' ? <StickyNote className="h-4 w-4 flex-shrink-0" aria-hidden="true" /> : <FileText className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
          <span className="chat-mention-title">{item.title}</span>
          <span className="chat-mention-kind">{t(item.kind === 'note' ? 'chat.mentionNote' : 'chat.mentionSource')}</span>
        </li>)}
      </ul>}
      {images.length > 0 && <ChatImages images={images} disabled={busy}
        onRemove={index => setImages(previous => previous.filter((_, position) => position !== index))} />}
      {documents.length > 0 && <ul className="chat-documents" aria-label={t('chat.attachedFiles')}>
        {documents.map(document => <li key={document.key} className="chat-document" data-status={document.status}>
          {documentPending(document) ? <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" aria-hidden="true" />
            : document.status === 'failed' ? <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            : <FileText className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
          <span className="chat-document-name" title={document.name}>{document.name}</span>
          <span className="chat-document-status">{t(DOCUMENT_STATUS[document.status])}</span>
          <button type="button" className="chat-document-remove" aria-label={t('chat.removeFile', { name: document.name })}
            disabled={queued} onClick={() => removeDocument(document)}><X className="h-3 w-3" aria-hidden="true" /></button>
        </li>)}
      </ul>}
      {queued && <p className="text-xs text-muted-foreground" role="status">{t('chat.sendWhenReady')}</p>}
      <input ref={fileInputRef} type="file" accept={documentHandlers ? undefined : CHAT_IMAGE_TYPES.join(',')} multiple
        aria-label={t(documentHandlers ? 'chat.attachFiles' : 'chat.attachImages')} className="hidden" disabled={busy}
        onChange={event => {
          addFiles(Array.from(event.target.files || []))
          event.target.value = ''
        }} />
      <LiquidSurface className="chat-composer-glass" radius={24}><div className="chat-composer-controls flex gap-2 items-end min-w-0">
        <Button type="button" variant="outline" size="icon" className="h-[40px] w-[40px] flex-shrink-0"
          aria-label={t(documentHandlers ? 'chat.attachFiles' : 'chat.attachImages')} title={t(documentHandlers ? 'chat.attachFilesHint' : 'chat.attachImages')} disabled={busy}
          onClick={() => fileInputRef.current?.click()}>
          {readingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : documentHandlers ? <Paperclip className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
        </Button>
        <Textarea
          id={chatInputId}
          name="chat-message"
          autoComplete="off"
          value={input}
          onChange={(e) => { setInput(e.target.value); updateMention(e.target) }}
          onKeyDown={handleKeyDown}
          onKeyUp={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') updateMention(event.currentTarget) }}
          onClick={event => updateMention(event.currentTarget)}
          onBlur={() => setMentionQuery(null)}
          role={mentionables?.length ? 'combobox' : undefined}
          aria-autocomplete={mentionables?.length ? 'list' : undefined}
          aria-expanded={mentionables?.length ? mentionOpen : undefined}
          aria-controls={mentionOpen ? mentionListId : undefined}
          aria-activedescendant={mentionOpen ? `${mentionListId}-${mentionIndex}` : undefined}
          onPaste={event => {
            const files = Array.from(event.clipboardData.files)
            if (files.length) {
              event.preventDefault()
              addFiles(files)
            }
          }}
          placeholder={t(mentionables?.length ? 'chat.messagePlaceholderMentions' : 'chat.messagePlaceholder')}
          aria-label={t('chat.sendPlaceholder')}
          disabled={busy}
          className="flex-1 min-h-[40px] max-h-[100px] resize-none py-2 px-3 min-w-0"
          rows={1}
        />
        <Button
          onClick={handleSend}
          disabled={!canSend || busy}
          aria-label={t('chat.sendMessage')}
          size="icon"
          className="h-[40px] w-[40px] flex-shrink-0"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div></LiquidSurface>
    </div>
  )
}

// Single chat message row. Memoized so historical messages don't re-render when
// unrelated state (e.g. the composer input) changes.
interface ChatMessageProps {
  message: SourceChatMessage
  notebookId?: string
  followupsDisabled?: boolean
  onReply?: (message: string, options?: { hidden?: boolean }) => void | boolean | Promise<void | boolean>
  onCreateExam?: () => void
  onReferenceClick: (type: string, id: string) => void
}

const ChatMessage = memo(function ChatMessage({
  message,
  notebookId,
  followupsDisabled,
  onReply,
  onCreateExam,
  onReferenceClick
}: ChatMessageProps) {
  const { t } = useTranslation()
  const exportContent = replaceArcBlocksWithMarkdown(message.content)
    .replace(/\[\[image:(\d+)\]\]/g, (_, number) => message.images?.[Number(number) - 1]?.name ?? '')
    .replace(/\[\[quiz:[^\]]+\]\]/g, t('chat.inlineQuiz'))
    .replace(/\[\[followup:\d+\]\]/g, t('chat.continueQuestion'))
    .replace(/\[\[quiz-unavailable\]\]/g, t('chat.quizPreparationFailed'))
  return (
    <div
      className={`chat-message flex gap-3 ${
        message.type === 'human' ? 'justify-end' : 'justify-start'
      }`}
    >
      {message.type === 'ai' && (
        <div className="chat-message-avatar flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-teal-tint flex items-center justify-center">
            <Bot className="h-4 w-4 text-teal" />
          </div>
        </div>
      )}
      <div className={message.type === 'ai' ? 'chat-answer flex flex-col gap-2 min-w-0 flex-1' : 'flex flex-col gap-2 max-w-[80%]'}>
        <div
          className={`rounded-lg px-4 py-2 border ${
            message.type === 'human'
              ? 'bg-muted'
              : 'bg-card'
          }`}
        >
          {message.type === 'ai' ? (
            <div className="space-y-3">
              <ChatResponseContent content={message.content} images={message.images} quizzes={message.quizzes} followups={message.followups} disabled={followupsDisabled} onReply={onReply} onCreateExam={onCreateExam} onReferenceClick={onReferenceClick} />
            </div>
          ) : (
            <div className="space-y-2">
              {!!message.images?.length && <ChatImages images={message.images} />}
              {message.content && <p className="text-sm break-all">{splitMentions(message.content).map((segment, index) => 'mention' in segment
                ? <span key={index} className="chat-mention-chip" title={segment.mention.id}>
                  {segment.mention.id.startsWith('note:') ? <StickyNote className="h-3 w-3" aria-hidden="true" /> : <FileText className="h-3 w-3" aria-hidden="true" />}@{segment.mention.title}
                </span>
                : segment.text)}</p>}
            </div>
          )}
        </div>
        {message.type === 'ai' && (
          <MessageActions
            content={exportContent}
            notebookId={notebookId}
            messageId={message.id}
          />
        )}
      </div>
      {message.type === 'human' && (
        <div className="flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-muted border flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      )}
    </div>
  )
})
