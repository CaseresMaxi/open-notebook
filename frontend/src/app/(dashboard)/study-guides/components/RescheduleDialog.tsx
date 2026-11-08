'use client'

import { useEffect, useId, useState } from 'react'
import { CalendarSync, Loader2 } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRescheduleStudyGuide } from '@/lib/hooks/use-study-guides'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type { StudyGuide } from '@/lib/types/study-guides'
import { addDays, localToday, WEEKDAY_ORDER } from '@/lib/utils/study-guide'
import { WEEKDAY_LABELS } from '@/lib/utils/study-guide-labels'

const MINUTES = [15, 25, 30, 45, 60, 90, 120]

export function RescheduleDialog({
  guide,
  open,
  onOpenChange,
}: {
  guide: StudyGuide
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const fieldId = useId()
  const reschedule = useRescheduleStudyGuide(guide.id)
  const today = localToday()
  const [endDate, setEndDate] = useState('')
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set())
  const [minutes, setMinutes] = useState(45)

  useEffect(() => {
    if (!open) return
    const current = guide.exam_date ?? guide.end_date
    setEndDate(current > today ? current : addDays(today, 7))
    setWeekdays(new Set(guide.weekdays))
    setMinutes(guide.minutes_per_session)
  }, [open, guide, today])

  const isExam = !!guide.exam_date
  const valid = weekdays.size > 0 && (isExam ? endDate > today : endDate >= today)

  const submit = () =>
    reschedule.mutate(
      {
        ...(isExam ? { exam_date: endDate } : { end_date: endDate }),
        weekdays: Array.from(weekdays).sort(),
        minutes_per_session: minutes,
      },
      { onSuccess: () => onOpenChange(false) }
    )

  return (
    <Dialog open={open} onOpenChange={(value) => !reschedule.isPending && onOpenChange(value)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('studyGuides.reschedule')}</DialogTitle>
          <DialogDescription>{t('studyGuides.rescheduleDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-end`}>{isExam ? t('studyGuides.examDate') : t('studyGuides.endDate')}</Label>
            <Input
              id={`${fieldId}-end`}
              type="date"
              min={isExam ? addDays(today, 1) : today}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('studyGuides.studyDays')}</legend>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_ORDER.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={weekdays.has(day)}
                  onClick={() =>
                    setWeekdays((prev) => {
                      const next = new Set(prev)
                      if (next.has(day)) next.delete(day)
                      else next.add(day)
                      return next
                    })
                  }
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reschedule.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={!valid || reschedule.isPending}>
            {reschedule.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <CalendarSync className="mr-2 size-4" />
            )}
            {t('studyGuides.reschedule')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
