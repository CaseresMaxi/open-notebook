'use client'

import { WorkspaceBackdrop } from './WorkspaceBackdrop'
import { BrandMark } from './BrandMark'

import { createContext, useContext, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  Menu,
  UserRound,
  CreditCard,
  Settings,
} from 'lucide-react'
import { AppSidebar } from './AppSidebar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/hooks/use-translation'

const ShellContext = createContext(false)
const NavigationContext = createContext<(() => void) | null>(null)

export function useOpenNavigation() {
  return useContext(NavigationContext)
}

/** The dashboard owns a persistent shell; legacy page wrappers remain compatible. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const insideShell = useContext(ShellContext)
  return insideShell ? <>{children}</> : <DashboardShell>{children}</DashboardShell>
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const links = [
    ['/notebooks', 'navigation.notebooks', BookOpen],
    ['/profile', 'product.profile', UserRound],
    ['/payments', 'product.payments', CreditCard],
    ['/settings', 'navigation.settings', Settings],
  ] as const
  return (
    <ShellContext.Provider value={true}><NavigationContext.Provider value={() => setMenuOpen(true)}><div className="product-shell flex h-dvh overflow-hidden bg-background text-foreground">
      <WorkspaceBackdrop />
      <AppSidebar />
      <main
        id="main-content"
        className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden"
      >
        <header className="product-mobile-header md:hidden flex min-h-14 items-center justify-between gap-3 border-b bg-card px-4">
          <Link
            href="/notebooks"
            className="flex items-center gap-2 font-medium text-sm"
          >
            <BrandMark className="size-7" />
            {t('common.appName')}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('product.openNavigation')}
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
        </header>

        {children}
      </main>
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="product-shell max-w-sm">
          <DialogTitle>{t('product.studyNavigation')}</DialogTitle>
          <DialogDescription>{t('product.workspaceDesc')}</DialogDescription>
          <nav className="grid gap-1">
            {links.map(([href, label, Icon]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                aria-current={pathname === href ? 'page' : undefined}
                className="flex min-h-11 items-center gap-3 rounded-lg p-3 hover:bg-accent"
              >
                <Icon className="size-4" />
                {t(label)}
              </Link>
            ))}
          </nav>
        </DialogContent>
      </Dialog>
    </div></NavigationContext.Provider></ShellContext.Provider>
  )
}
