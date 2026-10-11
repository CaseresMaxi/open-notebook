'use client'

import { useAuthStore } from '@/lib/stores/auth-store'
import { useSearchParams } from 'next/navigation'

/** Explicit developer build/config AND an intentional URL opt-in.
 * Presentation gate only; backend authorization remains mandatory. */
export function useDevelopmentTools() {
  const { mode, user } = useAuthStore()
  const params = useSearchParams()
  return ((mode !== 'firebase' && !user) || !!user?.admin) && (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_DEVELOPER_TOOLS === 'true') && params?.get('developer') === '1'
}
