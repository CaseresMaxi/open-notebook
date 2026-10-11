'use client'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAccountUsage } from '@/lib/hooks/use-account-usage'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Button } from '@/components/ui/button'
export function AccountUsage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const usage = useAccountUsage(!!user)
  if (!user) return null
  if (usage.isPending)
    return <p role="status">{t('commercial.loadingUsage')}</p>
  if (usage.isError)
    return (
      <div role="alert">
        <p>{t('commercial.loadError')}</p>
        <Button variant="ghost" onClick={() => usage.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    )
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">{t('commercial.studyAllowance')}</h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-muted-foreground">
            {t('commercial.tokens')}
          </dt>
          <dd className="tabular-nums">
            {usage.data.used.tokens.toLocaleString()} /{' '}
            {usage.data.limits.monthly_tokens.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">
            {t('commercial.storage')}
          </dt>
          <dd className="tabular-nums">
            {(usage.data.used.storage_bytes / 1048576).toFixed(1)} /{' '}
            {(usage.data.limits.storage_bytes / 1048576).toFixed(0)} MB
          </dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        {t('commercial.allowancePeriod', { month: usage.data.month })}
      </p>
    </section>
  )
}
