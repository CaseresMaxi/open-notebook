'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ArrowDownAZ, ArrowUpZA, ExternalLink, FileText, MoreVertical, Plus, Trash2, Upload } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { sourcesApi } from '@/lib/api/sources'
import { QUERY_KEYS } from '@/lib/api/query-client'
import { useDeleteSource } from '@/lib/hooks/use-sources'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Button } from '@/components/ui/button'
import { ListSkeleton } from '@/components/common/LoadingSkeletons'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { AddSourceDialog } from '@/components/sources/AddSourceDialog'
import type { SourceListResponse } from '@/lib/types/api'

const TYPE_ICONS = { link: ExternalLink, upload: Upload, text: FileText } as const
const sourceType = (source: SourceListResponse) => source.asset?.url ? 'link' : source.asset?.file_path ? 'upload' : 'text'

export default function SourcesPage() {
  const { t } = useTranslation()
  const [addOpen, setAddOpen] = useState(false)
  const [deleting, setDeleting] = useState<SourceListResponse | null>(null)
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc')
  const remove = useDeleteSource()
  const query = useInfiniteQuery({
    queryKey: [...QUERY_KEYS.sources(), 'library', direction],
    initialPageParam: 0,
    retry: false,
    queryFn: ({ pageParam }) => sourcesApi.list({ limit: 30, offset: pageParam, sort_by: 'title', sort_order: direction }),
    getNextPageParam: (last, pages) => last.length === 30 ? pages.reduce((sum, page) => sum + page.length, 0) : undefined,
  })
  const rows = query.data?.pages.flatMap(page => page) ?? []
  return <AppShell>
    <div className="source-library-viewport flex-1 min-h-0 overflow-y-auto">
      <div className="product-page source-library-page">
        <div className="product-heading source-library-heading">
          <h1>{t('navigation.sources')}</h1>
          <div className="source-library-tools">
            <Button variant="ghost" size="icon" onClick={() => setDirection(direction === 'asc' ? 'desc' : 'asc')}
              aria-label={`${t('product.sortBy', { column: t('common.title') })}: ${t(direction === 'asc' ? 'product.ascending' : 'product.descending')}`}>
              {direction === 'asc' ? <ArrowDownAZ className="size-5" /> : <ArrowUpZA className="size-5" />}
            </Button>
            <Button onClick={() => setAddOpen(true)} aria-label={t('sources.newSource')}><Plus className="size-4" /><span className="source-library-add-label">{t('sources.newSource')}</span></Button>
          </div>
        </div>
        {query.isLoading ? <ListSkeleton rows={8} /> : query.isError ? <div role="alert"><p>{t('sources.failedToLoad')}</p><Button onClick={() => query.refetch()}>{t('product.retry')}</Button></div> :
          rows.length === 0 ? <p className="source-library-empty">{t('sources.noSourcesYet')}</p> :
          <ul className="source-library-list" aria-label={t('navigation.sources')}>
            {rows.map(source => {
              const type = sourceType(source)
              const TypeIcon = TYPE_ICONS[type]
              const title = source.title || t('sources.untitledSource')
              return <li key={source.id} className="source-library-record">
                <Link className="source-library-link" href={`/sources/${encodeURIComponent(source.id)}`}>
                  <span className="source-library-title">{title}</span>
                  <span className="source-library-meta">
                    <span className="inline-flex items-center gap-1"><TypeIcon className="size-3" aria-hidden="true" />{type === 'link' ? t('sources.addUrl') : type === 'upload' ? t('sources.uploadFile') : t('sources.enterText')}</span>
                    {source.insights_count > 0 && <span>{t('sources.insightsCount', { count: source.insights_count })}</span>}
                  </span>
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="source-library-menu" aria-label={`${t('common.actions')}: ${title}`}><MoreVertical className="size-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleting(source)}>
                      <Trash2 className="mr-2 size-4" />{t('sources.deleteSource')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            })}
          </ul>}
        {query.hasNextPage && <Button className="source-library-more" variant="ghost" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? t('common.loading') : t('product.loadMoreSources')}</Button>}
      </div>
    </div>
    <AddSourceDialog open={addOpen} onOpenChange={setAddOpen} />
    <ConfirmDialog open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null) }} title={t('sources.deleteSource')} description={t('sources.deleteSourceConfirm')} confirmText={t('common.delete')} confirmVariant="destructive" isLoading={remove.isPending} onConfirm={async () => { if (deleting) { await remove.mutateAsync(deleting.id); setDeleting(null) } }} />
  </AppShell>
}
