import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api/client'
import { QUERY_KEYS } from '@/lib/api/query-client'
export interface AccountPolicy {
  monthly_tokens: number
  monthly_calls: number
  monthly_images: number
  concurrent_calls: number
  storage_bytes: number
  model_id: string | null
  disabled: boolean
}
export interface AccountUsage {
  month: string
  used: { tokens: number; calls: number; images: number; storage_bytes: number }
  limits: AccountPolicy
}
export interface ManagedAccount extends Record<string, unknown> {
  uid: string
  email: string
  name: string
  policy: AccountPolicy
  usage: AccountUsage
}
export function useAccountUsage(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.accountUsage,
    enabled,
    queryFn: async () =>
      (await apiClient.get<AccountUsage>('/account/usage')).data,
  })
}
export function useManagedAccounts(enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.managedAccounts,
    enabled,
    queryFn: async () =>
      (await apiClient.get<ManagedAccount[]>('/admin/accounts')).data,
  })
}
export function useAccountPolicy() {
  const cache = useQueryClient()
  return useMutation({
    mutationFn: async ({
      uid,
      policy,
    }: {
      uid: string
      policy: AccountPolicy
    }) =>
      (
        await apiClient.put(
          `/admin/accounts/${encodeURIComponent(uid)}/policy`,
          policy
        )
      ).data,
    onSuccess: () => {
      cache.invalidateQueries({ queryKey: QUERY_KEYS.managedAccounts })
      cache.invalidateQueries({ queryKey: QUERY_KEYS.accountUsage })
    },
  })
}
