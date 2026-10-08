import { Suspense } from 'react'
import { NotebookLibrary } from '@/components/study/NotebookLibrary'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
export default function NotesPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <NotebookLibrary mode="notes" />
    </Suspense>
  )
}
