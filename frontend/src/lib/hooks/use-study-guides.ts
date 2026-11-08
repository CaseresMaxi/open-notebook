import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { studyGuidesApi } from '@/lib/api/study-guides'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useToast } from '@/lib/hooks/use-toast'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import {
  CardRating,
  CreateStudyGuideRequest,
  RescheduleRequest,
  StudyGuide,
} from '@/lib/types/study-guides'

export function useStudyGuides(notebookId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.studyGuides(notebookId),
    queryFn: () => studyGuidesApi.list(notebookId),
  })
}

export function useStudyGuide(id: string) {
  return useQuery({
    queryKey: QUERY_KEYS.studyGuide(id),
    queryFn: () => studyGuidesApi.get(id),
    enabled: !!id,
  })
}

function useErrorToast() {
  const { toast } = useToast()
  const { t } = useTranslation()
  return (error: unknown) =>
    toast({
      title: t('common.error'),
      description: getApiErrorMessage(error, (key) => t(key)),
      variant: 'destructive',
    })
}

export function useCreateStudyGuide() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()
  const onError = useErrorToast()

  return useMutation({
    mutationFn: (data: CreateStudyGuideRequest) => studyGuidesApi.create(data),
    onSuccess: (guide) => {
      queryClient.setQueryData(QUERY_KEYS.studyGuide(guide.id), guide)
      queryClient.invalidateQueries({ queryKey: ['study-guides', 'list'] })
      toast({ title: t('common.success'), description: t('studyGuides.createSuccess') })
    },
    onError,
  })
}

export function useDeleteStudyGuide() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { t } = useTranslation()
  const onError = useErrorToast()

  return useMutation({
    mutationFn: (id: string) => studyGuidesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['study-guides'] })
      toast({ title: t('common.success'), description: t('studyGuides.deleteSuccess') })
    },
    onError,
  })
}

/** Progress updates return the whole guide; store it instead of refetching. */
function useGuideUpdate<V>(id: string, mutationFn: (vars: V) => Promise<StudyGuide>) {
  const queryClient = useQueryClient()
  const onError = useErrorToast()
  return useMutation({
    mutationFn,
    onSuccess: (guide) => {
      queryClient.setQueryData(QUERY_KEYS.studyGuide(id), guide)
      queryClient.invalidateQueries({ queryKey: ['study-guides', 'list'] })
    },
    onError,
  })
}

export function useSetActivityDone(id: string) {
  return useGuideUpdate(id, ({ activityId, done }: { activityId: string; done: boolean }) =>
    studyGuidesApi.setActivityDone(id, activityId, done)
  )
}

export function useSetTopicConfidence(id: string) {
  return useGuideUpdate(id, ({ topicId, confidence }: { topicId: string; confidence: number }) =>
    studyGuidesApi.setConfidence(id, topicId, confidence)
  )
}

export function useReviewCard(id: string) {
  return useGuideUpdate(id, ({ cardId, rating }: { cardId: string; rating: CardRating }) =>
    studyGuidesApi.reviewCard(id, cardId, rating)
  )
}

export function useRescheduleStudyGuide(id: string) {
  const { toast } = useToast()
  const { t } = useTranslation()
  const mutation = useGuideUpdate(id, (data: RescheduleRequest) => studyGuidesApi.reschedule(id, data))
  return {
    ...mutation,
    mutate: (data: RescheduleRequest, options?: { onSuccess?: () => void }) =>
      mutation.mutate(data, {
        onSuccess: () => {
          toast({ title: t('common.success'), description: t('studyGuides.rescheduleSuccess') })
          options?.onSuccess?.()
        },
      }),
  }
}
