import apiClient from './client'
import type { NotebookDocument } from '@/lib/types/jupyter'

const base = (sourceId: string) => `/sources/${encodeURIComponent(sourceId)}/notebook`

export const jupyterApi = {
  get: async (sourceId: string, language?: string) =>
    (await apiClient.get<NotebookDocument>(base(sourceId), { params: { language } })).data,

  explanations: async (sourceId: string, language?: string, refresh = false) =>
    (await apiClient.post<{ explanations: Record<string, string> }>(`${base(sourceId)}/explanations`, { language, refresh })).data.explanations,

  explainOutput: async (sourceId: string, request: { code: string; output: string; context?: string; language?: string }) =>
    (await apiClient.post<{ explanation: string }>(`${base(sourceId)}/explain-output`, request)).data.explanation,
}
