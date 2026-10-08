'use client'

import { Children, isValidElement, type ReactNode } from 'react'
import { SortableDataTable, type SortableDataTableProps } from '@/components/arc/sortable-data-table/sortable-data-table'
import { useTranslation } from '@/lib/hooks/use-translation'

/** The one table primitive for application records and source/chat Markdown. */
export function StudyDataTable<T extends Record<string, unknown>>(props: SortableDataTableProps<T>) {
  const { t } = useTranslation()
  return <div className="product-data-table"><SortableDataTable caption={t('sources.content')} emptyMessage={t('sources.noSourcesYet')} sortLabel={(column, direction) => t('product.sortBy', { column }) + (direction ? `, ${direction === 'asc' ? t('product.ascending') : t('product.descending')}` : '')} {...props} /></div>
}

function childrenOf(node: ReactNode): ReactNode[] {
  return isValidElement<{ children?: ReactNode }>(node) ? Children.toArray(node.props.children) : []
}
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return childrenOf(node).map(textOf).join('')
}
export function MarkdownDataTable({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  const groups = Children.toArray(children)
  const headings = childrenOf(childrenOf(groups[0])[0])
  const cells = groups.slice(1).flatMap(group => childrenOf(group).map(row => childrenOf(row)))
  const rows = cells.map((row, index) => Object.fromEntries([['id', String(index)], ...row.map((cell, column) => [`c${column}`, childrenOf(cell)])]))
  return <StudyDataTable rows={rows} rowKey="id" caption={t('sources.content')} columns={headings.map((cell, index) => ({ key: `c${index}`, label: textOf(cell), sortable: false, render: value => value as ReactNode }))} />
}
