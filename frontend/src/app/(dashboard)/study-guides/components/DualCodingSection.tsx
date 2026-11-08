'use client'

import { useState } from 'react'
import { Loader2, RefreshCw, Shapes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { ChatImages } from '@/components/sources/ChatImages'
import { useGenerateDiagram } from '@/lib/hooks/use-study-guides'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { StudyGuide, StudyTopic } from '@/lib/types/study-guides'
import { responseKeys } from '@/lib/utils/study-guide'
import { AnswerBox } from './AnswerBox'
import { Section } from './ActivityMaterial'

/**
 * The topic's "make it visual" task: the learner builds their own diagram
 * first; the AI reference diagram (interactive concept map, steps, table or
 * an HTML/SVG drawing) is generated once and shown to compare with.
 */
export function DualCodingSection({
  guide,
  topic,
  context,
}: {
  guide: StudyGuide
  topic: StudyTopic
  context: string
}) {
  const { t } = useTranslation()
  const generate = useGenerateDiagram(guide.id)
  const [revealed, setRevealed] = useState(false)
  const diagram = guide.diagram_references?.[topic.id]

  const reveal = async () => {
    setRevealed(true)
    if (!diagram) await generate.mutateAsync({ topicId: topic.id })
  }

  return (
    <Section title={t('studyGuides.dualCoding')}>
      <p className="text-sm">{topic.dual_coding_task}</p>
      <p className="text-xs text-muted-foreground">{t('studyGuides.dualCodingHint')}</p>
      <AnswerBox
        guide={guide}
        responseKey={responseKeys.dualCoding(topic.id)}
        context={context}
        onSaved={reveal}
      />
      {!revealed && (
        <Button type="button" variant="ghost" size="sm" onClick={() => void reveal().catch(() => undefined)}>
          <Shapes className="mr-1.5 size-3.5" />
          {t('studyGuides.showReferenceDiagram')}
        </Button>
      )}
      {revealed && generate.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('studyGuides.generatingDiagram')}
        </p>
      )}
      {revealed && diagram && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <h5 className="flex-1 text-sm font-medium">{t('studyGuides.referenceDiagram')}</h5>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              disabled={generate.isPending}
              onClick={() => generate.mutate({ topicId: topic.id, regenerate: true })}
            >
              <RefreshCw className="mr-1 size-3.5" />
              {t('studyGuides.regenerateDiagram')}
            </Button>
          </div>
          {diagram.markdown && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MarkdownRenderer>{diagram.markdown}</MarkdownRenderer>
            </div>
          )}
          {diagram.visual && <ChatImages images={[diagram.visual]} showProvenance={false} large />}
        </div>
      )}
    </Section>
  )
}
