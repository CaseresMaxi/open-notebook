'use client'

import { Component, useMemo, useState, type ReactNode } from 'react'
import { LineChart } from '@/components/arc/line-chart/line-chart'
import { BarChart } from '@/components/arc/bar-chart/bar-chart'
import { DonutChart } from '@/components/arc/donut-chart/donut-chart'
import { WaffleChart } from '@/components/arc/waffle-chart/waffle-chart'
import { SortableDataTable } from '@/components/arc/sortable-data-table/sortable-data-table'
import { MetricCard } from '@/components/arc/metric-card/metric-card'
import { Gauge } from '@/components/arc/gauge/gauge'
import { Stepper } from '@/components/arc/stepper/stepper'
import { Accordion } from '@/components/arc/accordion/accordion'
import { Alert } from '@/components/arc/alert/alert'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { useTranslation } from '@/lib/hooks/use-translation'
import { parseArcBlock, type ArcSpec } from '@/lib/utils/arc-blocks'

class ArcBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function Steps({ spec }: { spec: Extract<ArcSpec, { type: 'steps' }> }) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(spec.items.length)
  return <Stepper
    orientation="vertical"
    current={current}
    onStepSelect={index => setCurrent(index === current ? spec.items.length : index)}
    label={spec.title || t('chat.arcSteps')}
    completeLabel={t('chat.arcStepsDone')}
    steps={spec.items.map((item, index) => ({ id: String(index), label: item.label, description: item.description }))}
  />
}

const fractionDigits = (value: number) => Math.min((String(value).split('.')[1] ?? '').length, 2)

function ArcContent({ spec }: { spec: ArcSpec }) {
  const { t, language } = useTranslation()
  switch (spec.type) {
    case 'line':
      return <LineChart
        label={spec.title || t('chat.arcChart')}
        unit={spec.unit}
        categoryLabel={t('chat.arcCategory')}
        series={spec.series.map((series, index) => ({ key: `s${index}`, label: series.name }))}
        data={spec.x.map((label, point) => ({
          key: String(point), label, axisLabel: label,
          values: Object.fromEntries(spec.series.map((series, index) => [`s${index}`, series.values[point]])),
        }))}
      />
    case 'bar':
      return <BarChart
        label={spec.title || t('chat.arcChart')}
        period={spec.period || ''}
        unit={spec.unit}
        averageLabel={t('chat.arcAverage')}
        valueLabel={t('chat.arcValue')}
        categoryLabel={t('chat.arcCategory')}
        data={spec.items.map((item, index) => ({ key: String(index), label: item.label, axisLabel: item.label.length > 8 ? `${item.label.slice(0, 7)}…` : item.label, value: item.value }))}
      />
    case 'donut':
      return <DonutChart
        label={spec.title || t('chat.arcChart')}
        unit={spec.unit}
        totalLabel={t('chat.arcTotal')}
        otherLabel={t('chat.arcOther')}
        data={spec.items.map((item, index) => ({ key: String(index), label: item.label, value: item.value }))}
      />
    case 'waffle':
      return <WaffleChart
        label={spec.title || t('chat.arcChart')}
        unit={spec.unit}
        data={spec.items.map((item, index) => ({ key: String(index), label: item.label, value: item.value }))}
      />
    case 'table': {
      const rows = spec.rows.map((row, index) => ({ __row: String(index), ...Object.fromEntries(row.map((cell, column) => [`c${column}`, cell ?? ''])) }))
      return <SortableDataTable
        caption={spec.title || t('chat.arcTable')}
        rowKey="__row"
        rows={rows}
        columns={spec.columns.map((label, column) => ({ key: `c${column}`, label }))}
        itemName={{ one: t('chat.arcRow'), other: t('chat.arcRows') }}
      />
    }
    case 'metrics':
      return <div className="arc-block-metrics">
        {spec.items.map((item, index) => <MetricCard key={index} label={item.label} value={item.value} decimals={fractionDigits(item.value)} locale={language} suffix={item.suffix} context={item.context || ''} change={item.change || undefined} />)}
      </div>
    case 'gauge':
      return <Gauge label={spec.title || t('chat.arcValue')} value={spec.value} min={spec.min} max={spec.max} detail={spec.detail} />
    case 'steps':
      return <Steps spec={spec} />
    case 'accordion':
      return <Accordion defaultOpen={-1} items={spec.items.map(item => ({ title: item.title, content: <MarkdownRenderer>{item.content}</MarkdownRenderer> }))} />
    case 'callout':
      return <Alert tone={spec.tone} title={spec.title}>{spec.text || undefined}</Alert>
  }
}

const TITLED = new Set<ArcSpec['type']>(['line', 'donut', 'waffle', 'steps', 'accordion', 'metrics'])

/** One interactive component from a ```arc block in an answer. */
export function ArcBlock({ source }: { source: string }) {
  const { t } = useTranslation()
  const spec = useMemo(() => parseArcBlock(source), [source])
  if (!spec) return <p role="status" className="arc-block-unavailable">{t('chat.arcUnavailable')}</p>
  const fallback = <p role="status" className="arc-block-unavailable">{t('chat.arcUnavailable')}</p>
  return <figure className={`arc-block arc-block-${spec.type}`} data-arc={spec.type}>
    {spec.title && TITLED.has(spec.type) && <figcaption className="arc-block-title">{spec.title}</figcaption>}
    <ArcBoundary fallback={fallback}><ArcContent spec={spec} /></ArcBoundary>
  </figure>
}

export default ArcBlock
