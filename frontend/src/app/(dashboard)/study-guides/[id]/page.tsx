'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, CalendarCheck, CalendarSync, Trash2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/common/EmptyState'
import { ListSkeleton, LoadError } from '@/components/common/LoadingSkeletons'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { CreateExamDialog } from '@/app/(dashboard)/exams/components/CreateExamDialog'
import {
  useDeleteStudyGuide,
  useSetActivityDone,
  useSetTopicConfidence,
  useStudyGuide,
} from '@/lib/hooks/use-study-guides'
import { useSources } from '@/lib/hooks/use-sources'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import type { StudySession, StudyTopic } from '@/lib/types/study-guides'
import {
  daysBetween,
  groupByWeek,
  localToday,
  missedSessionCount,
  nextSession,
  parsePlanDate,
  progressPercent,
  sessionStatus,
  todaySession,
} from '@/lib/utils/study-guide'
import { SessionView } from '../components/SessionView'
import { TopicCard } from '../components/TopicCard'
import { FlashcardReview } from '../components/FlashcardReview'
import { StudyMethod } from '../components/StudyMethod'
import { RescheduleDialog } from '../components/RescheduleDialog'
import { ACTIVITY_LABELS, GOAL_LABELS, LEVEL_LABELS, STATUS_LABELS } from '@/lib/utils/study-guide-labels'

const STATUS_CLASS = {
  done: 'bg-fern-tint',
  partial: 'bg-warn-tint',
  missed: 'bg-warn-tint',
  today: 'ring-2 ring-ring',
  upcoming: '',
} as const

export default function StudyGuidePage() {
  const { t, language } = useTranslation()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = decodeURIComponent(params?.id ?? '')
  const { data: guide, isLoading, isError, refetch } = useStudyGuide(id)
  const { data: sources = [] } = useSources(guide?.notebook_id)
  const toggle = useSetActivityDone(id)
  const confidence = useSetTopicConfidence(id)
  const deleteGuide = useDeleteStudyGuide()
  const [tab, setTab] = useState('today')
  const [openSession, setOpenSession] = useState<string | null>(null)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [examTopics, setExamTopics] = useState<StudyTopic[] | null>(null)

  const today = localToday()
  const topicsById = useMemo(
    () => Object.fromEntries((guide?.topics ?? []).map((topic) => [topic.id, topic])),
    [guide?.topics]
  )
  const sourceTitles = useMemo(
    () => Object.fromEntries(sources.map((s) => [s.id, s.title || s.id])),
    [sources]
  )

  if (isLoading) {
    return (
      <AppShell>
        <div className="product-page">
          <ListSkeleton />
        </div>
      </AppShell>
    )
  }
  if (isError || !guide) {
    return (
      <AppShell>
        <div className="product-page">
          <LoadError onRetry={() => refetch()} />
        </div>
      </AppShell>
    )
  }

  const busy = toggle.isPending || confidence.isPending
  const completed = new Set(guide.completed_activities ?? [])
  const current = todaySession(guide, today)
  const upcoming = nextSession(guide, today)
  const missed = missedSessionCount(guide, today)
  const percent = progressPercent(guide)
  const examIn = guide.exam_date ? daysBetween(today, guide.exam_date) : null
  const ended = (guide.exam_date ?? guide.end_date) < today

  const sessionProps = {
    guide,
    topicsById,
    busy,
    onToggle: (activityId: string, done: boolean) => toggle.mutate({ activityId, done }),
    onConfidence: (topicId: string, value: number) => confidence.mutate({ topicId, confidence: value }),
    onOpenFlashcards: () => setTab('cards'),
    onPracticeExam: (topics: StudyTopic[]) => setExamTopics(topics),
  }
  const formatDate = (value: string) =>
    parsePlanDate(value).toLocaleDateString(language, { weekday: 'short', day: 'numeric', month: 'short' })

  const renderSessionRow = (session: StudySession) => {
    const status = sessionStatus(session, completed, today)
    const done = session.activities.filter((a) => completed.has(a.id)).length
    const expanded = openSession === session.id
    return (
      <li key={session.id} className="rounded-xl border bg-card">
        <button
          type="button"
          className={cn('flex w-full items-center gap-3 rounded-xl p-3 text-left', STATUS_CLASS[status])}
          aria-expanded={expanded}
          onClick={() => setOpenSession(expanded ? null : session.id)}
        >
          <span className="w-28 shrink-0 text-sm font-medium">{formatDate(session.date)}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {session.activities.map((a) => t(ACTIVITY_LABELS[a.type].title)).join(' · ')}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {done}/{session.activities.length}
          </span>
          <Badge variant="outline" className="shrink-0">
            {t(STATUS_LABELS[status])}
          </Badge>
        </button>
        {expanded && (
          <div className="border-t p-4">
            <SessionView {...sessionProps} session={session} />
          </div>
        )}
      </li>
    )
  }

  return (
    <AppShell>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="product-page">
          <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-11 justify-self-start">
            <Link href="/study-guides">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t('studyGuides.backToGuides')}
            </Link>
          </Button>

          <header className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="font-display text-2xl font-medium tracking-tight">{guide.title}</h1>
                {guide.overview && <p className="text-muted-foreground mt-1 max-w-3xl">{guide.overview}</p>}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setRescheduleOpen(true)}>
                  <CalendarSync className="mr-2 size-4" />
                  {t('studyGuides.reschedule')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('studyGuides.deleteNamed', { title: guide.title })}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{t(GOAL_LABELS[guide.goal])}</Badge>
              <Badge variant="outline">{t(LEVEL_LABELS[guide.level])}</Badge>
              <Badge variant="outline">{t('studyGuides.topicCount', { n: guide.topic_count })}</Badge>
              <Badge variant="outline">{t('studyGuides.cardCount', { n: guide.card_count })}</Badge>
              {examIn != null && examIn >= 0 && (
                <Badge variant="outline">
                  {examIn === 0 ? t('studyGuides.examToday') : t('studyGuides.examInDays', { n: examIn })}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 max-w-xl">
              <Progress value={percent} className="flex-1" aria-label={t('studyGuides.progressPercent', { percent })} />
              <span className="text-sm tabular-nums text-muted-foreground">{percent}%</span>
            </div>
            {!guide.grounded && (
              <p className="flex gap-2 rounded-lg bg-warn-tint p-3 text-sm">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                {t('studyGuides.ungrounded')}
              </p>
            )}
            {guide.coverage_gaps.length > 0 && (
              <p className="flex gap-2 rounded-lg bg-warn-tint p-3 text-sm">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                {t('studyGuides.coverageGaps', { topics: guide.coverage_gaps.join(', ') })}
              </p>
            )}
            {guide.overloaded && (
              <p className="flex gap-2 rounded-lg bg-warn-tint p-3 text-sm">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                {t('studyGuides.overloaded')}
              </p>
            )}
            {(missed > 0 || ended) && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-warn-tint p-3 text-sm">
                <span className="flex-1">
                  {ended ? t('studyGuides.planEnded') : t('studyGuides.missedSessions', { n: missed })}
                </span>
                <Button size="sm" onClick={() => setRescheduleOpen(true)}>
                  {t('studyGuides.reschedule')}
                </Button>
              </div>
            )}
          </header>

          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList className="w-full sm:w-auto grid grid-cols-5 sm:inline-grid min-h-11">
              <TabsTrigger value="today">{t('studyGuides.tabs.today')}</TabsTrigger>
              <TabsTrigger value="plan">{t('studyGuides.tabs.plan')}</TabsTrigger>
              <TabsTrigger value="topics">{t('studyGuides.tabs.topics')}</TabsTrigger>
              <TabsTrigger value="cards">
                {t('studyGuides.tabs.cards')}
                {guide.due_card_count > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                    {guide.due_card_count}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="method">{t('studyGuides.tabs.method')}</TabsTrigger>
            </TabsList>

            <TabsContent value="today" className="max-w-3xl">
              {current ? (
                <SessionView {...sessionProps} session={current} defaultOpen />
              ) : (
                <EmptyState
                  icon={CalendarCheck}
                  title={t('studyGuides.noSessionToday')}
                  description={
                    upcoming
                      ? t('studyGuides.nextSessionOn', { date: formatDate(upcoming.date) })
                      : t('studyGuides.noMoreSessions')
                  }
                  action={
                    guide.due_card_count > 0 ? (
                      <Button onClick={() => setTab('cards')}>
                        {t('studyGuides.reviewCardsCount', { n: guide.due_card_count })}
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="plan" className="space-y-6 max-w-3xl">
              {groupByWeek(guide.sessions ?? []).map(([monday, sessions]) => (
                <section key={monday} className="space-y-2">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    {t('studyGuides.weekOf', { date: formatDate(monday) })}
                  </h2>
                  <ul className="space-y-2">{sessions.map(renderSessionRow)}</ul>
                </section>
              ))}
            </TabsContent>

            <TabsContent value="topics" className="space-y-3 max-w-3xl">
              {(guide.topics ?? []).map((topic, index) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  index={index}
                  stats={guide.topic_stats?.[topic.id]}
                  confidence={guide.topic_confidence?.[topic.id]}
                  prerequisites={topic.prerequisites.map((p) => topicsById[p]).filter(Boolean)}
                  sourceTitles={sourceTitles}
                  busy={busy}
                  onConfidence={(value) => confidence.mutate({ topicId: topic.id, confidence: value })}
                  onPracticeExam={() => setExamTopics([topic])}
                />
              ))}
            </TabsContent>

            <TabsContent value="cards">
              <FlashcardReview key={guide.id} guide={guide} />
            </TabsContent>

            <TabsContent value="method">
              <StudyMethod />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <RescheduleDialog guide={guide} open={rescheduleOpen} onOpenChange={setRescheduleOpen} />

      {examTopics && (
        <CreateExamDialog
          open
          onOpenChange={(open) => !open && setExamTopics(null)}
          initialNotebookId={guide.notebook_id}
          initialInstructions={t('studyGuides.examInstructions', {
            topics: examTopics.map((topic) => topic.title).join('; '),
          })}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('studyGuides.delete')}
        description={t('studyGuides.deleteDesc', { title: guide.title })}
        confirmText={t('common.delete')}
        confirmVariant="destructive"
        isLoading={deleteGuide.isPending}
        onConfirm={() =>
          deleteGuide.mutate(guide.id, {
            onSuccess: () => router.push('/study-guides'),
            onSettled: () => setDeleteOpen(false),
          })
        }
      />
    </AppShell>
  )
}
