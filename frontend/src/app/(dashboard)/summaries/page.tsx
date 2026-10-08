import { Suspense } from 'react'
import { NotebookLibrary } from '@/components/study/NotebookLibrary'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
export default function SummariesPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <NotebookLibrary mode="summaries" />
    </Suspense>
  )
}
