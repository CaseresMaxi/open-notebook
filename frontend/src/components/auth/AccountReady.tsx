'use client'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAuth } from '@/lib/hooks/use-auth'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/layout/BrandMark'
export function AccountReady() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const { logout } = useAuth()
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 p-6">
    <BrandMark className="size-8" />
    <h1 className="text-2xl font-medium">{t('account.workspacePending')}</h1>
    <p className="text-muted-foreground">{t('account.workspacePendingDesc')}</p>
    <p>{user?.name || user?.email}</p>
    <Button variant="outline" onClick={logout}>{t('common.signOut')}</Button>
  </main>
}
