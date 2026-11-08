import apiClient from './client'
import {
  CardRating,
  CreateStudyGuideRequest,
  ResponseGrade,
  RescheduleRequest,
  StudyGuide,
} from '@/lib/types/study-guides'
import { localToday } from '@/lib/utils/study-guide'
import type { ExamAnswer } from '@/lib/types/exams'

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

  reviewCard: async (id: string, cardId: string, rating: CardRating, answer?: string) => {
    const response = await apiClient.post<StudyGuide>(
      `${path(id)}/cards/${encodeURIComponent(cardId)}/review`,
      { rating, today: localToday(), answer: answer?.trim() || undefined }
    )
    return response.data
  },

  saveResponse: async (id: string, key: string, answer: ExamAnswer, context: string) => {
    const response = await apiClient.post<StudyGuide>(
      `${path(id)}/responses`,
      { key, answer, context },
      { params: { today: localToday() } }
    )
    return response.data
  },

  gradeResponse: async (id: string, responseId: string, grade: ResponseGrade | null) => {
    const response = await apiClient.patch<StudyGuide>(
      `${path(id)}/responses/${encodeURIComponent(responseId)}`,
      { grade },
      { params: { today: localToday() } }
    )
    return response.data
  },

  analyzeResponse: async (id: string, responseId: string) => {
    const response = await apiClient.post<StudyGuide>(
      `${path(id)}/responses/${encodeURIComponent(responseId)}/analyze`,
      undefined,
      { params: { today: localToday() } }
    )
    return response.data
  },

  generateDiagram: async (id: string, topicId: string, regenerate = false) => {
    const response = await apiClient.post<StudyGuide>(
      `${path(id)}/topics/${encodeURIComponent(topicId)}/diagram`,
      undefined,
      { params: { today: localToday(), regenerate } }
    )
    return response.data
  },

  deleteResponse: async (id: string, responseId: string) => {
    const response = await apiClient.delete<StudyGuide>(
      `${path(id)}/responses/${encodeURIComponent(responseId)}`,
      { params: { today: localToday() } }
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
