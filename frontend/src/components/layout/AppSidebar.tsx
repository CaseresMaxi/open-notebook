'use client'

import { useAuthStore } from '@/lib/stores/auth-store'
import { BrandMark } from './BrandMark'

import Link from 'next/link'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useId } from 'react'
import { LiquidSurface } from './LiquidSurface'
import { motionTokens } from '@/components/arc/motion-tokens'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  FileText,
  UserRound,
  CreditCard,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/hooks/use-auth'
import { useSidebarStore } from '@/lib/stores/sidebar-store'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
import { useTranslation } from '@/lib/hooks/use-translation'

export function AppSidebar() {
  const { user } = useAuthStore()
  const { t } = useTranslation()
  const pathname = usePathname()
  const { logout } = useAuth()
  const { isCollapsed, toggleCollapse } = useSidebarStore()
  const { openNotebookDialog } = useCreateDialogs()
  const navId = useId()
  const reduced = useReducedMotion()
  const items = [
    { label: t('navigation.notebooks'), href: '/notebooks', icon: BookOpen },
    { label: t('navigation.sources'), href: '/sources', icon: FileText },
    { label: t('product.profile'), href: '/profile', icon: UserRound },
    { label: t('product.payments'), href: '/payments', icon: CreditCard },
    ...(user?.admin ? [{label:t('commercial.accounts'),href:'/admin/accounts',icon:UserRound}] : []),
  ]
  return (
    <aside
      className={cn(
        'app-sidebar hidden md:flex shrink-0 h-full flex-col py-4',
        isCollapsed ? 'w-20 px-3' : 'w-52 px-3'
      )}
    >
      <div
        className={cn(
          'flex min-h-12 items-center gap-2 mb-6',
          isCollapsed ? 'justify-center' : 'justify-between'
        )}
      >
        <Link
          href="/notebooks"
          aria-label={t('common.appName')}
          className={cn(
            'flex min-w-0 items-center gap-2 text-sm font-medium',
            isCollapsed && 'hidden'
          )}
        >
          <BrandMark className="size-5 shrink-0" />
          {!isCollapsed && <span>{t('common.appName')}</span>}
        </Link>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('product.toggleNavigation')}
          onClick={toggleCollapse}
          data-testid="sidebar-toggle"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>
      </div>
      <Button
        variant="ghost"
        onClick={openNotebookDialog}
        aria-label={t('notebooks.newNotebook')}
        className="sidebar-create mb-4 justify-start"
      >
        <Plus className="size-4" />
        {!isCollapsed && t('notebooks.newNotebook')}
      </Button>
      <LiquidSurface className="sidebar-menu" radius={20}>
      <LayoutGroup id={navId}>
      <nav
        aria-label={t('product.studyNavigation')}
        className="space-y-1 p-2"
      >
        {items.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={isCollapsed ? label : undefined}
            aria-label={isCollapsed ? label : undefined}
            aria-current={
              pathname === href || pathname?.startsWith(`${href}/`)
                ? 'page'
                : undefined
            }
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground',
              isCollapsed && 'justify-center',
              'relative isolate'
            )}
          >
            {(pathname === href || pathname?.startsWith(`${href}/`)) && <motion.span layoutId="nav-selection" transition={reduced ? { duration: 0 } : motionTokens.spring.morph} className="nav-selection" aria-hidden="true" />}
            <Icon className="size-4 shrink-0" />
            {!isCollapsed && label}
          </Link>
        ))}
      </nav>
      </LayoutGroup>
      </LiquidSurface>
      <div className={cn('sidebar-utilities mt-auto flex items-center gap-1 pt-6', isCollapsed && 'flex-col')}>
        <Link href="/settings" aria-label={isCollapsed ? t('navigation.settings') : undefined}
          title={isCollapsed ? t('navigation.settings') : undefined}
          className={cn('flex min-h-11 flex-1 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground hover:text-foreground', isCollapsed && 'justify-center')}>
          <Settings className="size-4 shrink-0" />
          {!isCollapsed && t('navigation.settings')}
        </Link>
        <Button size="icon" variant="ghost" onClick={logout} aria-label={t('common.signOut')} title={t('common.signOut')}>
          <LogOut className="size-4" />
        </Button>
      </div>
    </aside>
  )
}
