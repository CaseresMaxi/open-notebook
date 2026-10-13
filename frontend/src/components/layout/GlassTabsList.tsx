'use client'

import { useId, type ReactNode } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motionTokens } from '@/components/arc/motion-tokens'
import { LiquidSurface } from './LiquidSurface'

/** `trailing` places extra controls (icon buttons) inside the same glass pill, after the tabs. */
export function GlassTabsList({ value, options, label, trailing }: { value: string; options: { value: string; label: string }[]; label: string; trailing?: ReactNode }) {
  const id = useId()
  const reduced = useReducedMotion()
  const tabs = <TabsList aria-label={label}>
      {options.map(option => <TabsTrigger key={option.value} value={option.value}>
        {value === option.value && <motion.span className="nav-selection" layoutId="tab-selection" transition={reduced ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" />}
        <span className="relative">{option.label}</span>
      </TabsTrigger>)}
    </TabsList>
  return <LiquidSurface className="glass-tabs"><LayoutGroup id={id}>
    {trailing ? <div className="glass-tabs-row">{tabs}<div className="glass-tabs-trailing">{trailing}</div></div> : tabs}
  </LayoutGroup></LiquidSurface>
}
