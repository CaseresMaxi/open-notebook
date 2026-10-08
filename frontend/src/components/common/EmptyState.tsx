import { EmptyState as ArcEmptyState } from "@/components/arc/empty-state/empty-state"
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return <ArcEmptyState icon={<Icon aria-hidden="true" />} title={title} description={description} action={action} />
}
