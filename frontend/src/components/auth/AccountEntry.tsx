'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { AccountForm } from './AccountForm'
import { useAuthStore } from '@/lib/stores/auth-store'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/hooks/use-translation'

export function AccountEntry({ register = false }: { register?: boolean }) {
  const { t } = useTranslation()
  const { firebaseConfig, authRequired, error, checkAuthRequired } = useAuthStore()
  useEffect(() => { if (authRequired === null) void checkAuthRequired().catch(() => {}) }, [authRequired, checkAuthRequired])
  if (authRequired === null) return <main className="flex min-h-dvh items-center justify-center p-6">
    {error ? <div className="max-w-md space-y-5"><p role="alert">{t('common.unableToConnect')}</p><Button onClick={() => checkAuthRequired().catch(() => {})}>{t('common.retryConnection')}</Button></div> : <LoadingSpinner />}
  </main>
  if (!firebaseConfig) return <main className="flex min-h-dvh items-center justify-center"><Link href="/notebooks">{t('navigation.notebooks')}</Link></main>
  return <div className="product-shell"><AccountForm register={register} /></div>
}
