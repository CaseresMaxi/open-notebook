import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDevelopmentTools } from './use-development-tools'

const query = vi.hoisted(() => ({ value: '' }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query.value) }))
afterEach(() => { vi.unstubAllEnvs(); query.value = '' })

describe('developer controls visibility', () => {
  it('keeps controls hidden in production even with the URL flag', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEVELOPER_TOOLS', '')
    query.value = 'developer=1'
    expect(renderHook(useDevelopmentTools).result.current).toBe(false)
  })
  it('requires an intentional URL opt-in even in development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(renderHook(useDevelopmentTools).result.current).toBe(false)
    query.value = 'developer=1'
    expect(renderHook(useDevelopmentTools).result.current).toBe(true)
  })
  it('allows explicitly configured builds only with the URL flag', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_ENABLE_DEVELOPER_TOOLS', 'true')
    expect(renderHook(useDevelopmentTools).result.current).toBe(false)
    query.value = 'developer=1'
    expect(renderHook(useDevelopmentTools).result.current).toBe(true)
  })
})
