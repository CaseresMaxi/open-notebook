'use client'

import { BrandMark } from './BrandMark'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  FileText,
  StickyNote,
  AlignLeft,
  GraduationCap,
  MessageSquare,
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
import { Avatar } from '@/components/arc/avatar/avatar'
import { useAuth } from '@/lib/hooks/use-auth'
import { useSidebarStore } from '@/lib/stores/sidebar-store'
import { useCreateDialogs } from '@/lib/hooks/use-create-dialogs'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useProfile } from '@/lib/hooks/use-profile'

export function AppSidebar() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { logout } = useAuth()
  const { isCollapsed, toggleCollapse } = useSidebarStore()
  const { openNotebookDialog } = useCreateDialogs()
  const profile = useProfile()
  const items = [
    { label: t('navigation.notebooks'), href: '/notebooks', icon: BookOpen },
    { label: t('navigation.sources'), href: '/sources', icon: FileText },
    { label: t('common.notes'), href: '/notes', icon: StickyNote },
    { label: t('product.summaries'), href: '/summaries', icon: AlignLeft },
    { label: t('navigation.exams'), href: '/exams', icon: GraduationCap },
    { label: t('common.chat'), href: '/chat', icon: MessageSquare },
  ]
  const accountItems = [
    { label: t('product.profile'), href: '/profile', icon: UserRound },
    { label: t('product.payments'), href: '/payments', icon: CreditCard },
  ]
  return (
    <aside
      className={cn(
        'app-sidebar hidden md:flex shrink-0 h-full flex-col border-r py-4',
        isCollapsed ? 'w-20 px-3' : 'w-60 px-4'
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
          <BrandMark className="size-8 shrink-0" />
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
        variant="outline"
        onClick={openNotebookDialog}
        aria-label={t('notebooks.newNotebook')}
        className="mb-6"
      >
        <Plus className="size-4" />
        {!isCollapsed && t('notebooks.newNotebook')}
      </Button>
      <nav
        aria-label={t('product.studyNavigation')}
        className="flex-1 space-y-1 overflow-y-auto"
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
              (pathname === href || pathname?.startsWith(`${href}/`)) &&
                'bg-card text-foreground font-medium border border-border'
            )}
          >
            <Icon className="size-4 shrink-0" />
            {!isCollapsed && label}
          </Link>
        ))}
      </nav>
      <div className="border-t pt-4 mt-4 space-y-1">
        {accountItems.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={isCollapsed ? label : undefined}
            title={isCollapsed ? label : undefined}
            aria-current={pathname === href ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 px-3 rounded-xl text-sm hover:bg-accent',
              isCollapsed && 'justify-center',
              pathname === href && 'bg-card font-medium'
            )}
          >
            <Icon className="size-4 shrink-0" />
            {!isCollapsed && label}
          </Link>
        ))}
        <Link
          href="/settings"
          aria-label={isCollapsed ? t('navigation.settings') : undefined}
          className={cn(
            'flex min-h-11 items-center gap-3 px-3 rounded-xl text-sm text-muted-foreground hover:bg-accent',
            isCollapsed && 'justify-center'
          )}
        >
          <Settings className="size-4 shrink-0" />
          {!isCollapsed && t('navigation.settings')}
        </Link>
        <div
          className={cn(
            'flex items-center gap-3 pt-4 mt-2 border-t min-w-0',
            isCollapsed && 'flex-col'
          )}
        >
          <Link href="/profile" aria-label={t('product.profile')}>
            <Avatar
              name={profile.name || t('product.localProfile')}
              size="sm"
            />
          </Link>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium">
                {profile.name || t('product.localProfile')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('product.personalWorkspace')}
              </p>
            </div>
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={logout}
            aria-label={t('common.signOut')}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  )
}
