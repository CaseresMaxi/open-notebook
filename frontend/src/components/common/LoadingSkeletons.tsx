'use client'

import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

// Shapes shown while a list's first load is in flight, so a page never claims
// "nothing here yet" before it actually knows.

function LoadingRegion({ className, children }: { className?: string; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-live="polite" className={className} data-testid="loading-skeleton">
      <span className="sr-only">{t('common.loading')}</span>
      {children}
    </div>
  )
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <LoadingRegion className={cn('space-y-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-1">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4" style={{ width: `${72 - (i % 3) * 14}%` }} />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}

export function CardGridSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <LoadingRegion className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border p-4">
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        </div>
      ))}
    </LoadingRegion>
  )
}

export function TableSkeleton({ rows = 6, columns = 4, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <LoadingRegion className={cn('w-full space-y-1', className)}>
      <div className="flex gap-4 border-b border-border pb-3">
        {Array.from({ length: columns }, (_, c) => (
          <Skeleton key={c} className={cn('h-3', c === 0 ? 'flex-[2]' : 'flex-1 max-sm:hidden')} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-border py-3 last:border-0">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton
              key={c}
              className={cn('h-4', c === 0 ? 'flex-[2]' : 'flex-1 max-sm:hidden')}
              style={c === 0 ? { maxWidth: `${85 - (r % 4) * 12}%` } : undefined}
            />
          ))}
        </div>
      ))}
    </LoadingRegion>
  )
}

export function ChatSkeleton({ className }: { className?: string }) {
  const bubbles: Array<['start' | 'end', string]> = [
    ['end', 'w-2/5'], ['start', 'w-4/5'], ['start', 'w-3/5'], ['end', 'w-1/3'], ['start', 'w-3/4'],
  ]
  return (
    <LoadingRegion className={cn('space-y-4 py-4', className)}>
      {bubbles.map(([side, width], i) => (
        <div key={i} className={cn('flex', side === 'end' ? 'justify-end' : 'justify-start')}>
          <Skeleton className={cn('rounded-2xl', width, side === 'end' ? 'h-10' : 'h-16')} />
        </div>
      ))}
    </LoadingRegion>
  )
}

export function LoadError({ onRetry, message, className }: { onRetry?: () => void; message?: string; className?: string }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 py-10 text-center', className)}>
      <AlertCircle className="size-6 text-destructive" />
      <p className="text-sm text-muted-foreground">{message ?? t('common.loadFailed')}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  )
}
