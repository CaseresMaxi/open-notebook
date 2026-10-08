'use client'

import SegmentedControl, { type SegmentedControlProps } from '@/components/arc/segmented-control/segmented-control'
import { LiquidSurface } from './LiquidSurface'

export function GlassSegmentedControl(props: SegmentedControlProps) {
  return <LiquidSurface className="glass-segments"><SegmentedControl {...props} /></LiquidSurface>
}
