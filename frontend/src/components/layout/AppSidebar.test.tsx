import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { usePathname } from 'next/navigation'
import { AppSidebar } from './AppSidebar'
import { useSidebarStore } from '@/lib/stores/sidebar-store'

vi.mock('@/lib/hooks/use-profile', () => ({ useProfile: () => ({ name: '', email: '', bio: '' }) }))
describe('AppSidebar', () => {
  afterEach(() => { vi.mocked(usePathname).mockReturnValue(''); vi.mocked(useSidebarStore).mockReturnValue({ isCollapsed: false, toggleCollapse: vi.fn() } as ReturnType<typeof useSidebarStore>) })
  it('shows the study functions and account pages', () => {
    const { container } = render(<AppSidebar />)
    for (const href of ['/notebooks', '/sources', '/notes', '/summaries', '/exams', '/chat', '/profile', '/payments']) expect(container.querySelector(`a[href="${href}"]`)).toBeInTheDocument()
    for (const href of ['/podcasts', '/transformations', '/advanced', '/settings/models']) expect(container.querySelector(`a[href="${href}"]`)).toBeNull()
  })
  it('marks only the notebook link as active on a notebook page', () => {
    vi.mocked(usePathname).mockReturnValue('/notebooks/notebook:123')
    const { container } = render(<AppSidebar />)
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1)
    expect(container.querySelector('[aria-current="page"]')).toHaveAttribute('href', '/notebooks')
  })
  it('renders the application name and logout action', () => {
    render(<AppSidebar />)
    expect(screen.getByText('common.appName')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.signOut' })).toBeInTheDocument()
  })
  it('toggles the navigation width', () => {
    const toggleCollapse = vi.fn()
    vi.mocked(useSidebarStore).mockReturnValue({ isCollapsed: false, toggleCollapse } as ReturnType<typeof useSidebarStore>)
    render(<AppSidebar />)
    fireEvent.click(screen.getByTestId('sidebar-toggle'))
    expect(toggleCollapse).toHaveBeenCalledOnce()
  })
  it('keeps accessible labels when collapsed', () => {
    vi.mocked(useSidebarStore).mockReturnValue({ isCollapsed: true, toggleCollapse: vi.fn() } as ReturnType<typeof useSidebarStore>)
    render(<AppSidebar />)
    expect(screen.queryByText('common.appName')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'product.summaries' })).toBeInTheDocument()
  })
})
