'use client'

import SegmentedControl, { type SegmentedControlProps } from '@/components/arc/segmented-control/segmented-control'
import { LiquidSurface } from './LiquidSurface'
import { cn } from '@/lib/utils'

export function GlassSegmentedControl({ className, ...props }: SegmentedControlProps & { className?: string }) {
  return <LiquidSurface className={cn('glass-segments', className)}><SegmentedControl {...props} /></LiquidSurface>
}
