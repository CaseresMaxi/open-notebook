'use client'

import { useRouter, useParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { useSourceChat } from '@/lib/hooks/use-source-chat'
import { ChatPanel } from '@/components/sources/ChatPanel'
import { useNavigation } from '@/lib/hooks/use-navigation'
import { useTranslation } from '@/lib/hooks/use-translation'
import { AppShell } from '@/components/layout/AppShell'
import { SourceDetailContent } from '@/components/sources/SourceDetailContent'

export default function SourceDetailPage() {
  const router = useRouter()
  const params = useParams()
  const sourceId = params?.id ? decodeURIComponent(params.id as string) : ''
  const navigation = useNavigation()
  const { t } = useTranslation()
  const [panel, setPanel] = useState('source')

  // Initialize source chat
  const chat = useSourceChat(sourceId)

  const handleBack = useCallback(() => {
    const returnPath = navigation.getReturnPath()
    router.push(returnPath)
    navigation.clearReturnTo()
  }, [navigation, router])

  return (
    <AppShell>
    <div className="source-workspace flex flex-col flex-1 min-h-0">
      {panel === 'chat' && (
        <div className="source-workspace-toolbar">
          <Button variant="ghost" size="sm" onClick={() => setPanel('source')}>
            <ArrowLeft className="h-4 w-4" />{t('sources.content')}
          </Button>
        </div>
      )}
      {/* Main content: Source detail + Chat */}
      <div className="source-detail-grid flex-1 min-h-0 grid overflow-hidden">
        {/* Left column - Source detail */}
        <div className={`min-h-0 overflow-hidden ${panel === 'source' ? 'flex' : 'hidden'} flex-col`}>
          <SourceDetailContent
            sourceId={sourceId}
            showChatButton
            onChatClick={() => setPanel('chat')}
            onClose={handleBack}
            onBack={handleBack}
            backLabel={navigation.getReturnLabel()}
          />
        </div>

        {/* Right column - Chat */}
        <div className={`min-h-0 overflow-hidden ${panel === 'chat' ? 'flex' : 'hidden'} flex-col`}>
          <ChatPanel
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            contextIndicators={chat.contextIndicators}
            onSendMessage={chat.sendMessage}
            modelOverride={chat.currentSession?.model_override ?? chat.pendingModelOverride ?? undefined}
            onModelChange={(model) => chat.setModelOverride(model ?? null)}
            sessions={chat.sessions}
            currentSessionId={chat.currentSessionId}
            onCreateSession={(title) => chat.createSession({ title })}
            onSelectSession={chat.switchSession}
            onUpdateSession={(sessionId, title) => chat.updateSession(sessionId, { title })}
            onDeleteSession={chat.deleteSession}
            loadingSessions={chat.loadingSessions}
            loadingMessages={chat.loadingMessages}
          />
        </div>
      </div>
    </div>
    </AppShell>
  )
}
