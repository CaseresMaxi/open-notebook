'use client'

import { NotebookResponse } from '@/lib/types/api'
import { NotebookCard } from './NotebookCard'
import { NotebookRow } from './NotebookRow'
import { useNotebookViewStore } from '@/lib/stores/notebook-view-store'
import { CardGridSkeleton, ListSkeleton, LoadError } from '@/components/common/LoadingSkeletons'
import { EmptyState } from '@/components/common/EmptyState'
import { Book, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { useTranslation } from '@/lib/hooks/use-translation'

interface NotebookListProps {
  notebooks?: NotebookResponse[]
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
  title: string
  collapsible?: boolean
  emptyTitle?: string
  emptyDescription?: string
  onAction?: () => void
  actionLabel?: string
}

export function NotebookList({ 
  notebooks, 
  isLoading, 
  isError = false,
  onRetry,
  title, 
  collapsible = false,
  emptyTitle,
  emptyDescription,
  onAction,
  actionLabel,
}: NotebookListProps) {
  const { t } = useTranslation()
  const viewMode = useNotebookViewStore((state) => state.viewMode)
  const [isExpanded, setIsExpanded] = useState(!collapsible)

  if (isLoading) {
    return viewMode === 'list' ? <ListSkeleton rows={6} /> : <CardGridSkeleton />
  }

  if (isError && !notebooks?.length) {
    return <LoadError onRetry={onRetry} />
  }

  if (!notebooks || notebooks.length === 0) {
    return (
      <EmptyState
        icon={Book}
        title={emptyTitle ?? t('common.noResults')}
        description={emptyDescription ?? t('chat.startByCreating')}
        action={onAction && actionLabel ? (
          <Button onClick={onAction} variant="outline" className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            {actionLabel}
          </Button>
        ) : undefined}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {collapsible && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        )}
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        <span className="text-sm text-muted-foreground">({notebooks.length})</span>
      </div>

      {isExpanded && (
        viewMode === 'list' ? (
          <div className="flex flex-col gap-2">
            {notebooks.map((notebook) => (
              <NotebookRow key={notebook.id} notebook={notebook} />
            ))}
          </div>
        ) : (
          <div className="notebook-tiles">
            {notebooks.map((notebook, index) => (
              <NotebookCard key={notebook.id} notebook={notebook} index={index} />
            ))}
          </div>
        )
      )}
    </div>
  )
}
