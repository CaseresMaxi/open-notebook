'use client'

import Link from 'next/link'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { LanguageToggle } from '@/components/common/LanguageToggle'
import { AppShell } from '@/components/layout/AppShell'
import { SettingsForm } from './components/SettingsForm'
import { useSettings } from '@/lib/hooks/use-settings'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function SettingsPage() {
  const { t } = useTranslation()
  const { refetch } = useSettings()

  return (
    <AppShell>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="product-page">
          <div className="max-w-4xl">
            <div className="flex items-center gap-4 mb-6">
              <h1 className="font-display text-2xl font-medium tracking-tight">{t('navigation.settings')}</h1>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-3 mb-6"><ThemeToggle /><LanguageToggle /></div>
            <details className="mt-8">
              <summary>{t('navigation.advanced')}</summary>
            <div className="flex flex-wrap gap-4 my-6 text-sm">
              <Link className="product-link" href="/settings/models">{t('navigation.models')}</Link>
              <Link className="product-link" href="/transformations">{t('navigation.transformations')}</Link>
              <Link className="product-link" href="/advanced">{t('navigation.advanced')}</Link>
            </div>
            <SettingsForm />
            </details>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
