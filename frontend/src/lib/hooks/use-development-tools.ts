'use client'

import { useSearchParams } from 'next/navigation'

/** Explicit developer build/config AND an intentional URL opt-in.
 * Presentation gate only; backend authorization remains mandatory. */
export function useDevelopmentTools() {
  const params = useSearchParams()
  return (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENABLE_DEVELOPER_TOOLS === 'true') && params?.get('developer') === '1'
}
