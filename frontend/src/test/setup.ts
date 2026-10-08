import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Node 26 exposes an unavailable localStorage without --localstorage-file.
// Browser tests need their own storage, independent of that host getter.
if (!window.localStorage) {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(String(key)) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(String(key)),
    setItem: (key: string, value: string) => { values.set(String(key), String(value)) },
  } })
}

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: vi.fn(() => ''),
  useSearchParams: () => new URLSearchParams(),
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock @/lib/hooks/use-translation with standard t() function
vi.mock('../lib/hooks/use-translation', () => {
  return {
    useTranslation: () => ({
      t: (key: string) => key,
      language: 'en-US',
      setLanguage: vi.fn(),
    }),
  }
})

// Mock @/lib/hooks/use-auth
vi.mock('@/lib/hooks/use-auth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: '1', email: 'test@example.com' },
    logout: vi.fn(),
    isLoading: false,
  })),
}))

// Mock @/lib/stores/sidebar-store
vi.mock('@/lib/stores/sidebar-store', () => ({
  useSidebarStore: vi.fn(() => ({
    isCollapsed: false,
    toggleCollapse: vi.fn(),
  })),
}))

// Mock @/lib/hooks/use-create-dialogs
vi.mock('@/lib/hooks/use-create-dialogs', () => ({
  useCreateDialogs: vi.fn(() => ({
    openSourceDialog: vi.fn(),
    openNotebookDialog: vi.fn(),
    openPodcastDialog: vi.fn(),
  })),
}))
