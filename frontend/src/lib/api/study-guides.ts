import apiClient from './client'
import {
  CardRating,
  CreateStudyGuideRequest,
  RescheduleRequest,
  StudyGuide,
} from '@/lib/types/study-guides'
import { localToday } from '@/lib/utils/study-guide'

const path = (id: string) => `/study-guides/${encodeURIComponent(id)}`

// The learner's local date decides what is "today" (due cards, missed sessions).
export const studyGuidesApi = {
  list: async (notebookId?: string) => {
    const response = await apiClient.get<StudyGuide[]>('/study-guides', {
      params: { today: localToday(), ...(notebookId ? { notebook_id: notebookId } : {}) },
    })
    return response.data
  },

  get: async (id: string) => {
    const response = await apiClient.get<StudyGuide>(path(id), { params: { today: localToday() } })
    return response.data
  },

  create: async (data: CreateStudyGuideRequest) => {
    const response = await apiClient.post<StudyGuide>('/study-guides', {
      start_date: localToday(),
      ...data,
    })
    return response.data
  },

  delete: async (id: string) => {
    await apiClient.delete(path(id))
  },

  setActivityDone: async (id: string, activityId: string, done: boolean) => {
    const response = await apiClient.post<StudyGuide>(
      `${path(id)}/progress`,
      { activity_id: activityId, done },
      { params: { today: localToday() } }
    )
    return response.data
  },

  setConfidence: async (id: string, topicId: string, confidence: number) => {
    const response = await apiClient.put<StudyGuide>(
      `${path(id)}/topics/${encodeURIComponent(topicId)}/confidence`,
      { confidence },
      { params: { today: localToday() } }
    )
    return response.data
  },

  reviewCard: async (id: string, cardId: string, rating: CardRating) => {
    const response = await apiClient.post<StudyGuide>(
      `${path(id)}/cards/${encodeURIComponent(cardId)}/review`,
      { rating, today: localToday() }
    )
    return response.data
  },

  reschedule: async (id: string, data: RescheduleRequest) => {
    const response = await apiClient.post<StudyGuide>(`${path(id)}/reschedule`, {
      today: localToday(),
      ...data,
    })
    return response.data
  },
}
