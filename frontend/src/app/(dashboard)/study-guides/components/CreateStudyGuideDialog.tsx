'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNotebooks } from '@/lib/hooks/use-notebooks'
import { useSources } from '@/lib/hooks/use-sources'
import { useModels } from '@/lib/hooks/use-models'
import { useLanguages } from '@/lib/hooks/use-podcasts'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useCreateStudyGuide } from '@/lib/hooks/use-study-guides'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type { StudyGoal, StudyLevel } from '@/lib/types/study-guides'
import { addDays, localToday, WEEKDAY_ORDER } from '@/lib/utils/study-guide'
import { GOAL_HINTS, GOAL_LABELS, LEVEL_LABELS, WEEKDAY_LABELS } from '@/lib/utils/study-guide-labels'

const DEFAULT_VALUE = '__default__'
const GOALS: StudyGoal[] = ['understand', 'memorize', 'exam', 'apply']
const LEVELS: StudyLevel[] = ['beginner', 'intermediate', 'advanced']
const MINUTES = [15, 25, 30, 45, 60, 90, 120]
const DURATIONS = [7, 14, 21, 30, 60, 90]

interface CreateStudyGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialNotebookId?: string
}

export function CreateStudyGuideDialog({ open, onOpenChange, initialNotebookId }: CreateStudyGuideDialogProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { mode, user } = useAuthStore()
  const canChooseModel = mode === 'legacy' && !user
  const fieldId = useId()
  const { data: notebooks = [] } = useNotebooks(false)
  const { data: models = [] } = useModels()
  const { data: languages = [] } = useLanguages()
  const createGuide = useCreateStudyGuide()

  const [notebookId, setNotebookId] = useState(initialNotebookId ?? '')
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [includeNotes, setIncludeNotes] = useState(false)
  const [topicsText, setTopicsText] = useState('')
  const [goal, setGoal] = useState<StudyGoal>('understand')
  const [level, setLevel] = useState<StudyLevel>('intermediate')
  const [hasExam, setHasExam] = useState(false)
  const [examDate, setExamDate] = useState(() => addDays(localToday(), 14))
  const [durationDays, setDurationDays] = useState(14)
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set([0, 1, 2, 3, 4]))
  const [minutes, setMinutes] = useState(45)
  const [language, setLanguage] = useState(DEFAULT_VALUE)
  const [modelId, setModelId] = useState(DEFAULT_VALUE)
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')

  const { data: sourcesData, isLoading: sourcesLoading } = useSources(notebookId || undefined)
  const sources = useMemo(() => sourcesData ?? [], [sourcesData])
  const languageModels = useMemo(() => models.filter((m) => m.type === 'language'), [models])

  useEffect(() => {
    if (open && initialNotebookId) setNotebookId(initialNotebookId)
  }, [open, initialNotebookId])

  useEffect(() => {
    setSelectedSources(new Set(sources.map((s) => s.id)))
  }, [sources])

  const focusTopics = topicsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const usesMaterial = selectedSources.size > 0 || includeNotes
  const today = localToday()
  const validExam = !hasExam || examDate > today
  const canSubmit =
    !!notebookId &&
    (usesMaterial || focusTopics.length > 0) &&
    weekdays.size > 0 &&
    validExam &&
    !createGuide.isPending

  const toggleSource = (id: string, checked: boolean) =>
    setSelectedSources((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  const toggleWeekday = (day: number) =>
    setWeekdays((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })

  const handleSubmit = () => {
    const allSelected = selectedSources.size === sources.length && sources.length > 0
    createGuide.mutate(
      {
        notebook_id: notebookId,
        source_ids: allSelected ? undefined : Array.from(selectedSources),
        include_notes: includeNotes,
        focus_topics: focusTopics,
        goal,
        level,
        exam_date: hasExam ? examDate : undefined,
        duration_days: hasExam ? undefined : durationDays,
        weekdays: Array.from(weekdays).sort(),
        minutes_per_session: minutes,
        language: language === DEFAULT_VALUE ? undefined : language,
        instructions: instructions.trim() || undefined,
        title: title.trim() || undefined,
        model_id: canChooseModel && modelId !== DEFAULT_VALUE ? modelId : undefined,
      },
      {
        onSuccess: (guide) => {
          onOpenChange(false)
          router.push(`/study-guides/${encodeURIComponent(guide.id)}`)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !createGuide.isPending && onOpenChange(value)}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('studyGuides.newGuide')}</DialogTitle>
          <DialogDescription>{t('studyGuides.newGuideDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-notebook`}>{t('exams.notebook')}</Label>
            <Select value={notebookId} onValueChange={setNotebookId}>
              <SelectTrigger id={`${fieldId}-notebook`} className="w-full">
                <SelectValue placeholder={t('exams.selectNotebook')} />
              </SelectTrigger>
              <SelectContent>
                {notebooks.map((nb) => (
                  <SelectItem key={nb.id} value={nb.id}>
                    {nb.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {notebookId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('exams.sources')}</Label>
                {sources.length > 0 && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() =>
                      setSelectedSources(
                        selectedSources.size === sources.length ? new Set() : new Set(sources.map((s) => s.id))
                      )
                    }
                  >
                    {selectedSources.size === sources.length ? t('exams.selectNone') : t('exams.selectAll')}
                  </Button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                {sourcesLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
                {!sourcesLoading && sources.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t('exams.noSources')}</p>
                )}
                {sources.map((source) => (
                  <label key={source.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedSources.has(source.id)}
                      onCheckedChange={(checked) => toggleSource(source.id, checked === true)}
                    />
                    <span className="truncate">{source.title || t('exams.untitledSource')}</span>
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={includeNotes} onCheckedChange={(c) => setIncludeNotes(c === true)} />
                {t('exams.includeNotes')}
              </label>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-topics`}>{t('studyGuides.focusTopics')}</Label>
            <Textarea
              id={`${fieldId}-topics`}
              value={topicsText}
              rows={3}
              placeholder={t('studyGuides.focusTopicsPlaceholder')}
              onChange={(e) => setTopicsText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {usesMaterial ? t('studyGuides.focusTopicsHint') : t('studyGuides.topicsOnlyHint')}
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('studyGuides.goal')}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {GOALS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={goal === value}
                  onClick={() => setGoal(value)}
                  className={cn(
                    'rounded-lg border p-3 text-left text-sm transition-colors min-h-11',
                    goal === value ? 'border-primary bg-primary/10' : 'hover:bg-accent'
                  )}
                >
                  <span className="font-medium">{t(GOAL_LABELS[value])}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {t(GOAL_HINTS[value])}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-level`}>{t('studyGuides.level')}</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as StudyLevel)}>
                <SelectTrigger id={`${fieldId}-level`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVELS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(LEVEL_LABELS[value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-minutes`}>{t('studyGuides.minutesPerSession')}</Label>
              <Select value={String(minutes)} onValueChange={(v) => setMinutes(Number(v))}>
                <SelectTrigger id={`${fieldId}-minutes`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {t('studyGuides.minutes', { n: value })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('studyGuides.studyDays')}</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_ORDER.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={weekdays.has(day)}
                  onClick={() => toggleWeekday(day)}
                  className={cn(
                    'min-h-11 min-w-11 rounded-full border px-3 text-sm',
                    weekdays.has(day) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'
                  )}
                >
                  {t(WEEKDAY_LABELS[day])}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={hasExam} onCheckedChange={(c) => setHasExam(c === true)} />
              {t('studyGuides.hasExam')}
            </label>
            {hasExam ? (
              <div className="space-y-2">
                <Label htmlFor={`${fieldId}-exam`}>{t('studyGuides.examDate')}</Label>
                <Input
                  id={`${fieldId}-exam`}
                  type="date"
                  min={addDays(today, 1)}
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  aria-invalid={!validExam}
                />
                {!validExam && <p className="text-xs text-destructive">{t('studyGuides.examDateInvalid')}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor={`${fieldId}-duration`}>{t('studyGuides.duration')}</Label>
                <Select value={String(durationDays)} onValueChange={(v) => setDurationDays(Number(v))}>
                  <SelectTrigger id={`${fieldId}-duration`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {t('studyGuides.days', { n: value })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-language`}>{t('exams.language')}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger id={`${fieldId}-language`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_VALUE}>{t('exams.sameAsSources')}</SelectItem>
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.name}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-title`}>{t('studyGuides.guideTitle')}</Label>
              <Input
                id={`${fieldId}-title`}
                value={title}
                placeholder={t('studyGuides.guideTitlePlaceholder')}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-instructions`}>{t('exams.instructions')}</Label>
            <Textarea
              id={`${fieldId}-instructions`}
              value={instructions}
              rows={2}
              placeholder={t('studyGuides.instructionsPlaceholder')}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          {canChooseModel && (
            <div className="space-y-2">
              <Label htmlFor={`${fieldId}-model`}>{t('exams.model')}</Label>
              <Select value={modelId} onValueChange={setModelId}>
                <SelectTrigger id={`${fieldId}-model`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_VALUE}>{t('exams.defaultModel')}</SelectItem>
                  {languageModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-3">
          {createGuide.isPending && (
            <p className="text-sm text-muted-foreground mr-auto">{t('studyGuides.generatingHint')}</p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createGuide.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {createGuide.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {createGuide.isPending ? t('studyGuides.generating') : t('studyGuides.generate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
