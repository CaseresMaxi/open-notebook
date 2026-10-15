import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { jupyterApi } from '@/lib/api/jupyter'
import { QUERY_KEYS } from '@/lib/api/query-client'
import type { NotebookDocument } from '@/lib/types/jupyter'

export function useJupyterNotebook(sourceId: string, language?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.jupyterNotebook(sourceId, language),
    queryFn: () => jupyterApi.get(sourceId, language),
    enabled: !!sourceId,
    staleTime: Infinity,
  })
}

/** Generates (or regenerates) the tutor explanations and caches them in the query. */
export function useNotebookExplanations(sourceId: string, language?: string) {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: (refresh: boolean = false) => jupyterApi.explanations(sourceId, language, refresh),
    onSuccess: explanations => {
      cache.setQueryData<NotebookDocument>(QUERY_KEYS.jupyterNotebook(sourceId, language), current =>
        current ? { ...current, explanations } : current)
    },
  })
}
