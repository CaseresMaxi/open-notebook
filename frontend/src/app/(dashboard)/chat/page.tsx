'use client'

import Link from 'next/link'
import { MessageSquare, ArrowUpRight, Plus } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/EmptyState'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useNotebooks } from '@/lib/hooks/use-notebooks'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function ChatPage() {
  const { t } = useTranslation()
  const {
    data: notebooks = [],
    isLoading,
    isError,
    refetch,
  } = useNotebooks(false)
  const { openNotebookDialog } = useCreateDialogs()
  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="product-page">
          <div className="product-heading">
            <div>
              <h1>{t('common.chat')}</h1>
              <p>{t('product.chatDesc')}</p>
            </div>
          </div>
          {isError ? (
            <div role="alert">
              <p>{t('common.error')}</p>
              <Button variant="outline" onClick={() => refetch()}>
                {t('product.retry')}
              </Button>
            </div>
          ) : isLoading ? (
            <LoadingSpinner />
          ) : notebooks.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title={t('product.noNotebooks')}
              description={t('product.noNotebooksDesc')}
              action={
                <Button onClick={openNotebookDialog}>
                  <Plus className="size-4" />
                  {t('notebooks.newNotebook')}
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 max-w-4xl">
              {notebooks.map((nb) => (
                <Link
                  key={nb.id}
                  href={`/notebooks/${encodeURIComponent(nb.id)}?tab=chat`}
                  className="product-panel flex items-center gap-4 hover:bg-accent"
                >
                  <MessageSquare className="size-5 text-teal shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h2 className="font-medium break-words">{nb.name}</h2>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {nb.description || t('product.openChat')}
                    </p>
                  </div>
                  <ArrowUpRight className="size-4 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
