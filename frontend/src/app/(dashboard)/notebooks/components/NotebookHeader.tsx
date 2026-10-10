'use client'

import { useState } from 'react'
import { NotebookResponse } from '@/lib/types/api'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/arc/drawer/drawer'
import { LiquidSurface } from '@/components/layout/LiquidSurface'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Archive, ArchiveRestore, GraduationCap, Trash2, MoreHorizontal } from 'lucide-react'
import { useUpdateNotebook } from '@/lib/hooks/use-notebooks'
import { NotebookDeleteDialog } from './NotebookDeleteDialog'
import { InlineEdit } from '@/components/common/InlineEdit'
import { useTranslation } from '@/lib/hooks/use-translation'

interface NotebookHeaderProps {
  notebook: NotebookResponse
}

export function NotebookHeader({ notebook }: NotebookHeaderProps) {
  const { t } = useTranslation()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  
  const updateNotebook = useUpdateNotebook()

  const handleUpdateName = async (name: string) => {
    if (!name || name === notebook.name) return
    
    await updateNotebook.mutateAsync({
      id: notebook.id,
      data: { name }
    })
  }

  const handleUpdateDescription = async (description: string) => {
    if (description === notebook.description) return
    
    await updateNotebook.mutateAsync({
      id: notebook.id,
      data: { description }
    })
  }

  const handleArchiveToggle = () => {
    updateNotebook.mutate({
      id: notebook.id,
      data: { archived: !notebook.archived }
    })
  }

  return (
    <>
      <div className="notebook-heading-bar">
        <div className="notebook-heading-title">
          <h1 title={notebook.name}>{notebook.name}</h1>
          {notebook.archived && <Badge variant="secondary">{t('notebooks.archived')}</Badge>}
        </div>
        <Drawer>
          <LiquidSurface className="notebook-heading-control" radius={16}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('common.actions')}>
                <MoreHorizontal className="size-5" />
              </Button>
            </DrawerTrigger>
          </LiquidSurface>
          <DrawerContent title={notebook.name} closeLabel={t('common.close')} className="product-shell">
            <div className="grid gap-6">
              <div className="grid gap-2">
                <span className="text-sm text-muted-foreground">{t('common.name')}</span>
                <InlineEdit id="notebook-name" name="notebook-name" value={notebook.name}
                  onSave={handleUpdateName} placeholder={t('notebooks.namePlaceholder')} />
              </div>
              <div className="grid gap-2">
                <span className="text-sm text-muted-foreground">{t('common.description')}</span>
                <InlineEdit id="notebook-description" name="notebook-description" value={notebook.description || ''}
                  onSave={handleUpdateDescription} placeholder={t('notebooks.addDescription')}
                  multiline emptyText={t('notebooks.addDescription')} />
              </div>
              <Button asChild>
                <Link href={`/exams?notebook=${encodeURIComponent(notebook.id)}&new=1`}>
                  <GraduationCap className="size-4" />{t('exams.createFromNotebook')}
                </Link>
              </Button>
              <Button variant="outline" onClick={handleArchiveToggle}>
                {notebook.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                {notebook.archived ? t('notebooks.unarchive') : t('notebooks.archive')}
              </Button>
              <Button variant="outline" onClick={() => setShowDeleteDialog(true)} className="text-destructive">
                <Trash2 className="size-4" />{t('common.delete')}
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      <NotebookDeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        notebookId={notebook.id}
        notebookName={notebook.name}
        redirectAfterDelete
      />
    </>
  )
}