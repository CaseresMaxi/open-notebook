'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Settings, ArrowUpRight } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Avatar } from '@/components/arc/avatar/avatar'
import { Input } from '@/components/arc/input/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { LanguageToggle } from '@/components/common/LanguageToggle'
import {
  useProfile,
  saveProfile,
  type LocalProfile,
} from '@/lib/hooks/use-profile'
import { useTranslation } from '@/lib/hooks/use-translation'

export default function ProfilePage() {
  const { t } = useTranslation()
  const profile = useProfile()
  const [draft, setDraft] = useState<LocalProfile>(profile)
  const [status, setStatus] = useState<'saved' | 'error' | null>(null)
  useEffect(() => {
    setDraft(profile)
  }, [profile])
  const update = (key: keyof LocalProfile, value: string) => {
    setStatus(null)
    setDraft((prev) => ({ ...prev, [key]: value }))
  }
  return (
    <AppShell>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="product-page">
          <div className="product-heading">
            <div>
              <h1>{t('product.profile')}</h1>
              <p>{t('product.profileDesc')}</p>
            </div>
          </div>
          <form
            className="product-form"
            onSubmit={(event) => {
              event.preventDefault()
              try {
                saveProfile({
                  name: draft.name.trim(),
                  email: draft.email.trim(),
                  bio: draft.bio.trim(),
                })
                setStatus('saved')
              } catch {
                setStatus('error')
              }
            }}
          >
            <section
              className="product-panel product-fields"
              aria-label={t('product.profile')}
            >
              <div className="flex items-center gap-4">
                <Avatar
                  name={draft.name || t('product.localProfile')}
                  size="xl"
                />
                <div>
                  <p className="text-lg font-medium break-words">
                    {draft.name || t('product.localProfile')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('product.personalWorkspace')}
                  </p>
                </div>
              </div>
              <Input
                label={t('product.name')}
                value={draft.name}
                onChange={(e) => update('name', e.target.value)}
                maxLength={80}
                autoComplete="name"
                name="display-name"
              />
              <Input
                label={t('product.email')}
                value={draft.email}
                onChange={(e) => update('email', e.target.value)}
                type="email"
                maxLength={254}
                autoComplete="email"
                name="profile-email"
              />
              <div className="grid gap-2">
                <label htmlFor="profile-bio" className="text-sm font-medium">
                  {t('product.bio')}
                </label>
                <Textarea
                  id="profile-bio"
                  value={draft.bio}
                  onChange={(e) => update('bio', e.target.value)}
                  maxLength={1000}
                  placeholder={t('product.bioHint')}
                  rows={4}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {t('product.localProfileNotice')}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Button type="submit">{t('product.saveProfile')}</Button>
                <p role="status" className="product-inline-status">
                  {status === 'saved'
                    ? t('product.profileSaved')
                    : status === 'error'
                      ? t('product.saveFailed')
                      : ''}
                </p>
              </div>
            </section>
            <section
              className="product-panel"
              aria-labelledby="profile-preferences"
            >
              <h2 id="profile-preferences">{t('product.preferences')}</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {t('product.appearance')}
              </p>
              <div className="flex flex-wrap gap-3">
                <ThemeToggle />
                <LanguageToggle />
              </div>
            </section>
            <Link href="/settings" className="product-link">
              <Settings className="size-4" />
              {t('product.accountSettings')}
              <ArrowUpRight className="size-4" />
            </Link>
          </form>
        </div>
      </div>
    </AppShell>
  )
}
