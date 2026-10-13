'use client'

import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { NotebookResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LiquidSurface } from '@/components/layout/LiquidSurface'
import { MoreHorizontal, Archive, ArchiveRestore, Trash2, FileText, StickyNote } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUpdateNotebook } from '@/lib/hooks/use-notebooks'
import { NotebookDeleteDialog } from './NotebookDeleteDialog'
import { useState, type CSSProperties } from 'react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { getDateLocale } from '@/lib/utils/date-locale'

// A stable accent per notebook, always from the theme's own hues, so the glass
// has colour to refract and notebooks are recognisable at a glance.
const ACCENTS = ['--teal', '--fern', '--violet', '--clay', '--type-pdf', '--type-video', '--type-web', '--type-audio']

export function notebookAccent(id: string) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return `var(${ACCENTS[hash % ACCENTS.length]})`
}

interface NotebookCardProps {
  notebook: NotebookResponse
  index?: number
}

export function NotebookCard({ notebook, index = 0 }: NotebookCardProps) {
  const { t, language } = useTranslation()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const updateNotebook = useUpdateNotebook()
  const initial = (notebook.name.trim()[0] || '·').toLocaleUpperCase()
  const updated = new Date(notebook.updated)

  const handleArchiveToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    updateNotebook.mutate({
      id: notebook.id,
      data: { archived: !notebook.archived }
    })
  }

  return (
    <>
      <article
        data-record-id={notebook.id}
        className="notebook-tile group"
        style={{ '--nb-accent': notebookAccent(notebook.id), '--nb-delay': `${Math.min(index, 8) * 55}ms` } as CSSProperties}
      >
        <span className="notebook-tile-halo" aria-hidden="true" />
        <LiquidSurface className="notebook-tile-glass" radius={26}>
          <div className="notebook-tile-body">
            <div className="flex items-start gap-3">
              <span className="notebook-tile-mark" aria-hidden="true">{initial}</span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h3 className="notebook-tile-title">
                  <Link
                    href={`/notebooks/${encodeURIComponent(notebook.id)}`}
                    className="after:absolute after:inset-0 after:rounded-[26px]"
                    title={notebook.name}
                  >
                    {notebook.name}
                  </Link>
                </h3>
                {notebook.archived && (
                  <Badge variant="secondary" className="mt-1">
                    {t('notebooks.archived')}
                  </Badge>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative z-10 -mr-2 -mt-1 size-10 rounded-full"
                    aria-label={t('product.notebookActions')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onClick={handleArchiveToggle}>
                    {notebook.archived ? (
                      <>
                        <ArchiveRestore className="h-4 w-4 mr-2" />
                        {t('notebooks.unarchive')}
                      </>
                    ) : (
                      <>
                        <Archive className="h-4 w-4 mr-2" />
                        {t('notebooks.archive')}
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowDeleteDialog(true)
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('common.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {notebook.description && (
              <p className="notebook-tile-description">{notebook.description}</p>
            )}

            <div className="notebook-tile-footer">
              <span className="notebook-tile-chip" title={t('navigation.sources')}>
                <FileText className="size-3.5" aria-hidden="true" />
                <span>{notebook.source_count}</span>
                <span className="sr-only">{t('navigation.sources')}</span>
              </span>
              <span className="notebook-tile-chip" title={t('common.notes')}>
                <StickyNote className="size-3.5" aria-hidden="true" />
                <span>{notebook.note_count}</span>
                <span className="sr-only">{t('common.notes')}</span>
              </span>
              {!Number.isNaN(updated.getTime()) && (
                <time className="notebook-tile-time" dateTime={notebook.updated} title={`${t('notebooks.updated')} ${updated.toLocaleString(language)}`}>
                  {formatDistanceToNow(updated, { addSuffix: true, locale: getDateLocale(language) })}
                </time>
              )}
            </div>
          </div>
        </LiquidSurface>
      </article>

      <NotebookDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        notebookId={notebook.id}
        notebookName={notebook.name}
      />
    </>
  )
}
