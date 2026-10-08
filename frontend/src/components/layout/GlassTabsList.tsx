'use client'

import { useId } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motionTokens } from '@/components/arc/motion-tokens'
import { LiquidSurface } from './LiquidSurface'

export function GlassTabsList({ value, options, label }: { value: string; options: { value: string; label: string }[]; label: string }) {
  const id = useId()
  const reduced = useReducedMotion()
  return <LiquidSurface className="glass-tabs"><LayoutGroup id={id}>
    <TabsList aria-label={label}>
      {options.map(option => <TabsTrigger key={option.value} value={option.value}>
        {value === option.value && <motion.span className="nav-selection" layoutId="tab-selection" transition={reduced ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" />}
        <span className="relative">{option.label}</span>
      </TabsTrigger>)}
    </TabsList>
  </LayoutGroup></LiquidSurface>
}
