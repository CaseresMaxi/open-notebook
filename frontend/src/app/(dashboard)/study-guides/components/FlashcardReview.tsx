'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Layers, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { responseKeys } from '@/lib/utils/study-guide'
import { EmptyState } from '@/components/common/EmptyState'
import { useReviewCard } from '@/lib/hooks/use-study-guides'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { CardRating, StudyGuide } from '@/lib/types/study-guides'
import { RATING_LABELS } from '@/lib/utils/study-guide-labels'

const RATINGS: CardRating[] = ['again', 'hard', 'good', 'easy']

/** Queue of card ids: a card rated "again" goes back to the end (relearning). */
export function nextQueue(queue: string[], rating: CardRating): string[] {
  const [current, ...rest] = queue
  return rating === 'again' && current ? [...rest, current] : rest
}

export function FlashcardReview({ guide }: { guide: StudyGuide }) {
  const { t } = useTranslation()
  const review = useReviewCard(guide.id)
  const cards = useMemo(() => Object.fromEntries((guide.cards ?? []).map((c) => [c.id, c])), [guide.cards])
  const topics = useMemo(() => Object.fromEntries((guide.topics ?? []).map((tp) => [tp.id, tp])), [guide.topics])
  const [queue, setQueue] = useState<string[] | null>(null)
  const [total, setTotal] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [typed, setTyped] = useState('')

  const start = (ids: string[]) => {
    setQueue(ids)
    setTotal(ids.length)
    setReviewed(0)
    setRevealed(false)
  }

  if (!queue) {
    const due = guide.due_card_ids ?? []
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground max-w-2xl">{t('studyGuides.flashcardsIntro')}</p>
        {due.length > 0 ? (
          <Button onClick={() => start(due)}>
            <Layers className="mr-2 size-4" />
            {t('studyGuides.reviewCardsCount', { n: due.length })}
          </Button>
        ) : (
          <EmptyState
            icon={CheckCircle2}
            title={t('studyGuides.noDueCards')}
            description={t('studyGuides.noDueCardsDesc')}
          />
        )}
        {(guide.cards?.length ?? 0) > 0 && (
          <Button variant="outline" onClick={() => start((guide.cards ?? []).map((c) => c.id))}>
            <RotateCcw className="mr-2 size-4" />
            {t('studyGuides.practiceAllCards', { n: guide.cards?.length ?? 0 })}
          </Button>
        )}
      </div>
    )
  }

  const card = queue.length ? cards[queue[0]] : undefined
  if (!card) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title={t('studyGuides.sessionDone')}
        description={t('studyGuides.sessionDoneDesc', { n: reviewed })}
        action={<Button onClick={() => setQueue(null)}>{t('common.back')}</Button>}
      />
    )
  }

  const rate = (rating: CardRating) => {
    review.mutate(
      { cardId: card.id, rating, answer: typed },
      {
        onSuccess: () => {
          setReviewed((n) => n + 1)
          setRevealed(false)
          setTyped('')
          setQueue((q) => nextQueue(q ?? [], rating))
        },
      }
    )
  }

  const remaining = queue.length
  const previous = guide.responses?.[responseKeys.card(card.id)]?.at(-1)
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Progress value={total ? ((total - Math.min(remaining, total)) / total) * 100 : 0} className="flex-1" />
        <span className="tabular-nums">{t('studyGuides.cardsLeft', { n: remaining })}</span>
      </div>
      <div className="rounded-2xl border bg-card p-6 space-y-4" aria-live="polite">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{topics[card.topic_id]?.title}</p>
        <p className="text-lg font-medium whitespace-pre-wrap">{card.front}</p>
        <Textarea
          rows={2}
          value={typed}
          readOnly={revealed}
          aria-label={t('studyGuides.typeYourAnswer')}
          placeholder={t('studyGuides.typeYourAnswer')}
          onChange={(event) => setTyped(event.target.value)}
        />
        {revealed ? (
          <p className="rounded-lg bg-teal-tint p-3 whitespace-pre-wrap">{card.back}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('studyGuides.recallFirst')}</p>
        )}
        {previous && (
          <p className="text-xs text-muted-foreground">
            {t('studyGuides.lastCardAnswer', { answer: previous.text })}
          </p>
        )}
      </div>
      {revealed ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {RATINGS.map((rating) => (
            <Button
              key={rating}
              variant={rating === 'again' ? 'outline' : rating === 'good' ? 'default' : 'secondary'}
              disabled={review.isPending}
              onClick={() => rate(rating)}
              className="h-auto min-h-11 flex-col py-2"
            >
              <span>{t(RATING_LABELS[rating])}</span>
              <span className="text-xs opacity-80">
                {card.next_intervals[rating] === 0
                  ? t('studyGuides.again')
                  : t('studyGuides.inDays', { n: card.next_intervals[rating] })}
              </span>
            </Button>
          ))}
        </div>
      ) : (
        <Button className="w-full min-h-11" onClick={() => setRevealed(true)}>
          {t('studyGuides.showAnswer')}
        </Button>
      )}
    </div>
  )
}
