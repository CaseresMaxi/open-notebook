'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery } from '@tanstack/react-query'
import { FileText, Plus, Trash2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { StudyDataTable } from '@/components/ui/study-data-table'
import type { SortState } from '@/components/arc/sortable-data-table/sortable-data-table'
import { sourcesApi } from '@/lib/api/sources'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useDeleteSource } from '@/lib/hooks/use-sources'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { AddSourceDialog } from '@/components/sources/AddSourceDialog'
import type { SourceListResponse } from '@/lib/types/api'

export default function SourcesPage() {
  const { t } = useTranslation()
  const [addOpen, setAddOpen] = useState(false)
  const [deleting, setDeleting] = useState<SourceListResponse | null>(null)
  const [sort, setSort] = useState<SortState>({ key: 'title', direction: 'asc' })
  const remove = useDeleteSource()
  const query = useInfiniteQuery({
    queryKey: [...QUERY_KEYS.sources(), 'library', sort],
    initialPageParam: 0,
    retry: false,
    queryFn: ({ pageParam }) => sourcesApi.list({ limit: 30, offset: pageParam, sort_by: 'title', sort_order: sort.direction }),
    getNextPageParam: (last, pages) => last.length === 30 ? pages.reduce((sum, page) => sum + page.length, 0) : undefined,
  })
  const rows = query.data?.pages.flatMap(page => page.map(source => ({ ...source }))) ?? []
  return <AppShell>
    <div className="source-library-viewport flex-1 min-h-0 overflow-y-auto">
      <div className="product-page source-library-page">
        <div className="product-heading source-library-heading">
          <h1>{t('navigation.sources')}</h1>
          <Button onClick={() => setAddOpen(true)}><Plus className="size-4" />{t('sources.newSource')}</Button>
        </div>
        {query.isLoading ? <LoadingSpinner /> : query.isError ? <div role="alert"><p>{t('sources.failedToLoad')}</p><Button onClick={() => query.refetch()}>{t('product.retry')}</Button></div> :
          <div className="source-library-table"><StudyDataTable rows={rows} rowKey="id" caption={t('navigation.sources')} emptyMessage={t('sources.noSourcesYet')} defaultSort={sort} onSortChange={setSort} columns={[
            { key: 'title', label: t('common.title'), render: (_, source) => <Link className="source-library-link flex min-h-11 items-center gap-3" href={`/sources/${encodeURIComponent(source.id)}`}><FileText className="size-4 shrink-0 text-muted-foreground" /><span className="break-words">{source.title || t('sources.untitledSource')}</span></Link> },
            { key: 'actions', label: t('common.actions'), sortable: false, width: 104, render: (_, source) => <div className="source-library-row-actions"><Button size="icon" variant="ghost" aria-label={`${t('sources.deleteSource')}: ${source.title || t('sources.untitledSource')}`} onClick={() => setDeleting(source)}><Trash2 className="size-4" /></Button></div> },
          ]} /></div>}
        {query.hasNextPage && <Button className="source-library-more" variant="ghost" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? t('common.loading') : t('product.loadMoreSources')}</Button>}
      </div>
    </div>
    <AddSourceDialog open={addOpen} onOpenChange={setAddOpen} />
    <ConfirmDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null) }} title={t('sources.deleteSource')} description={t('sources.deleteSourceConfirm')} confirmText={t('common.delete')} confirmVariant="destructive" isLoading={remove.isPending} onConfirm={async () => { if (deleting) { await remove.mutateAsync(deleting.id); setDeleting(null) } }} />
  </AppShell>
}
