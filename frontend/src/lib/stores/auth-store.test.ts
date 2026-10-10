import { beforeEach, describe, expect, it, vi } from 'vitest'
const api = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ default: api }))
vi.mock('@/lib/config', () => ({ getApiUrl: async () => '' }))
import { useAuthStore } from './auth-store'
const user = { uid: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true, admin: true }
describe('Account session logout', () => {
  beforeEach(() => { vi.clearAllMocks(); useAuthStore.setState({ accountEpoch: 0, mode: 'legacy', firebaseConfig: null, authRequired: false, user: null, token: null, isAuthenticated: true }); api.post.mockResolvedValue({ data: {} }) })
  it('ends an optional Firebase session while local mode remains the default', async () => {
    useAuthStore.setState({ user, firebaseConfig: { projectId: 'test' } })
    await useAuthStore.getState().logout()
    expect(api.post).toHaveBeenCalledWith('/auth/logout')
    expect(useAuthStore.getState().user).toBeNull()
  })
  it('retains account state when the server cannot confirm sign-out', async () => {
    useAuthStore.setState({ user, firebaseConfig: { projectId: 'test' } })
    api.post.mockRejectedValue(new Error('network unavailable'))
    await expect(useAuthStore.getState().logout()).rejects.toThrow('network unavailable')
    expect(useAuthStore.getState().user).toEqual(user)
  })
  it('preserves the local installation credential when opening an optional account session', async () => {
    useAuthStore.setState({ token: 'legacy-password', authRequired: true })
    api.post.mockResolvedValue({ data: { user } })
    await useAuthStore.getState().finishAccountLogin('firebase-id-token')
    expect(useAuthStore.getState().token).toBe('legacy-password')
  })
  it('does not restore a stale account after sign-out during account discovery', async () => {
    let resolveAccount!: (value: { data: { user: typeof user } }) => void
    api.get.mockResolvedValueOnce({ data: { auth_enabled: false, mode: 'legacy', firebase: { projectId: 'test' } } })
      .mockImplementationOnce(() => new Promise(resolve => { resolveAccount = resolve }))
    const discovery = useAuthStore.getState().checkAuthRequired()
    await vi.waitFor(() => expect(resolveAccount).toBeTypeOf('function'))
    await useAuthStore.getState().logout()
    resolveAccount({ data: { user } })
    await discovery
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
    expect(api.post).toHaveBeenCalledWith('/auth/logout')
  })
  it('keeps password-only local logout independent of Firebase', async () => {
    await useAuthStore.getState().logout()
    expect(api.post).not.toHaveBeenCalled()
  })
})
