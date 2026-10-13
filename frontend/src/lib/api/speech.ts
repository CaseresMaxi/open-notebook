import apiClient from './client'

export const speechApi = {
  /** MP3 of `text` read by the operator's default text-to-speech model. */
  synthesize: async (text: string, signal?: AbortSignal) => {
    const response = await apiClient.post<Blob>('/speech', { text }, { responseType: 'blob', signal })
    return response.data
  },
}
