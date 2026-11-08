'use client'

import { useEffect, useState } from 'react'
import { Eye, Loader2, Save, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ChatImages } from '@/components/sources/ChatImages'
import { OpenAnswerInput } from '@/app/(dashboard)/exams/components/OpenAnswerInput'
import {
  useAnalyzeResponse,
  useDeleteResponse,
  useGradeResponse,
  useSaveResponse,
} from '@/lib/hooks/use-study-guides'
import { useTranslation } from '@/lib/hooks/use-translation'
import { hasOpenAnswer } from '@/lib/utils/exam-answers'
import { cn } from '@/lib/utils'
import type { ExamAnswer } from '@/lib/types/exams'
import type { ResponseGrade, StudyGuide, StudyResponse } from '@/lib/types/study-guides'
import { autoAnalyze, loadAnswerDraft, saveAnswerDraft } from '@/lib/utils/study-guide'
import { GRADE_LABELS } from '@/lib/utils/study-guide-labels'

const GRADES: ResponseGrade[] = ['correct', 'partial', 'incorrect']

const GRADE_CLASS: Record<ResponseGrade, string> = {
  correct: 'bg-fern-tint',
  partial: 'bg-warn-tint',
  incorrect: 'bg-warn-tint',
}

interface AnswerBoxProps {
  guide: StudyGuide
  responseKey: string
  /** Activity id, or "topic" when answered from the Topics tab. */
  context: string
  /** Shown after answering (or on request) so the learner can check. */
  reference?: string
  /** Runs after saving, before the automatic AI analysis (e.g. build a reference). */
  onSaved?: () => Promise<unknown> | void
}

function ResponseItem({
  guide,
  response,
  showSelfGrade,
}: {
  guide: StudyGuide
  response: StudyResponse
  showSelfGrade: boolean
}) {
  const { t, language } = useTranslation()
  const analyze = useAnalyzeResponse(guide.id)
  const grade = useGradeResponse(guide.id)
  const remove = useDeleteResponse(guide.id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const created = new Date(response.created)
  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={response.created}>
          {Number.isNaN(created.getTime()) ? response.created : created.toLocaleString(language)}
        </time>
        {response.grade && (
          <Badge variant="outline" className={GRADE_CLASS[response.grade]}>
            {t(GRADE_LABELS[response.grade])}
            {response.graded_by === 'ai' && response.score != null && ` · ${Math.round(response.score * 100)}%`}
          </Badge>
        )}
        <span className="ml-auto flex gap-1">
          {!response.feedback && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              disabled={analyze.isPending}
              onClick={() => analyze.mutate(response.id)}
            >
              {analyze.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Sparkles className="mr-1 size-3.5" />}
              {analyze.isPending ? t('studyGuides.analyzing') : t('studyGuides.analyze')}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('studyGuides.deleteAnswer')}
            title={t('studyGuides.deleteAnswer')}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </span>
      </div>
      {response.text && <p className="whitespace-pre-wrap text-sm">{response.text}</p>}
      {response.images.length > 0 && <ChatImages images={response.images} showProvenance={false} />}
      {response.feedback && (
        <div className="rounded-md bg-teal-tint p-2 text-sm">
          <span className="font-medium">{t('studyGuides.aiFeedback')}: </span>
          {response.feedback}
        </div>
      )}
      {showSelfGrade && !response.grade && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('studyGuides.selfGradeQuestion')}</span>
          {GRADES.map((value) => (
            <Button
              key={value}
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={grade.isPending}
              onClick={() => grade.mutate({ responseId: response.id, grade: value })}
            >
              {t(GRADE_LABELS[value])}
            </Button>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('studyGuides.deleteAnswer')}
        description={t('studyGuides.deleteAnswerDesc')}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        isLoading={remove.isPending}
        onConfirm={() => remove.mutate(response.id, { onSettled: () => setConfirmDelete(false) })}
      />
    </li>
  )
}

/**
 * Answer a question inside the app: the draft is kept while typing, every
 * saved answer stays in the guide's history, and open answers are analyzed
 * by the AI after saving (short ones on request).
 */
export function AnswerBox({ guide, responseKey, context, reference, onSaved }: AnswerBoxProps) {
  const { t } = useTranslation()
  const save = useSaveResponse(guide.id)
  const analyze = useAnalyzeResponse(guide.id)
  const [draft, setDraft] = useState<ExamAnswer>('')
  const [revealed, setRevealed] = useState(false)
  const [showOlder, setShowOlder] = useState(false)
  const history = guide.responses?.[responseKey] ?? []
  const latest = history[history.length - 1]
  const older = history.slice(0, -1).reverse()

  useEffect(() => {
    setDraft(loadAnswerDraft<ExamAnswer>(guide.id, responseKey, context) ?? '')
  }, [guide.id, responseKey, context])

  const change = (value: ExamAnswer) => {
    setDraft(value)
    saveAnswerDraft(guide.id, responseKey, context, value)
  }

  const submit = () =>
    save.mutate(
      { key: responseKey, answer: draft, context },
      {
        onSuccess: async (updated) => {
          change('')
          setRevealed(true)
          const saved = updated.responses?.[responseKey]?.at(-1)
          // A failed reference (already reported) must not block the analysis.
          await Promise.resolve(onSaved?.()).catch(() => undefined)
          if (saved && autoAnalyze(responseKey)) analyze.mutate(saved.id)
        },
      }
    )

  return (
    <div className="space-y-3">
      <OpenAnswerInput value={draft} onChange={change} disabled={save.isPending} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={!hasOpenAnswer(draft) || save.isPending} onClick={submit}>
          {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
          {t('studyGuides.saveAnswer')}
        </Button>
        {reference && !revealed && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed(true)}>
            <Eye className="mr-1 size-3.5" />
            {t('studyGuides.showAnswer')}
          </Button>
        )}
        {analyze.isPending && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t('studyGuides.analyzing')}
          </span>
        )}
      </div>
      {reference && revealed && (
        <div className="rounded-md bg-teal-tint p-2 text-sm">
          <span className="font-medium">{t('studyGuides.referenceAnswer')}: </span>
          <span className="whitespace-pre-wrap">{reference}</span>
        </div>
      )}
      {latest && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t('studyGuides.yourLastAnswer')}</p>
          <ul className="space-y-2">
            <ResponseItem guide={guide} response={latest} showSelfGrade={!!reference && revealed} />
          </ul>
        </div>
      )}
      {older.length > 0 && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            className={cn('h-auto p-0 text-xs')}
            aria-expanded={showOlder}
            onClick={() => setShowOlder(!showOlder)}
          >
            {showOlder ? t('studyGuides.hideOlderAnswers') : t('studyGuides.olderAnswers', { n: older.length })}
          </Button>
          {showOlder && (
            <ul className="space-y-2">
              {older.map((response) => (
                <ResponseItem key={response.id} guide={guide} response={response} showSelfGrade={false} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
