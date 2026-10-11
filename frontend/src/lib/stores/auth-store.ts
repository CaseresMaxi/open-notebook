import axios from 'axios'
import type { FirebaseOptions } from 'firebase/app'
import type { AccountUser } from '@/lib/firebase'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import apiClient from '@/lib/api/client'
import { queryClient } from '@/lib/api/query-client'
import { getApiUrl } from '@/lib/config'

interface AuthState {
  accountEpoch: number
  mode: 'legacy' | 'firebase'
  firebaseConfig: FirebaseOptions | null
  user: AccountUser | null
  finishAccountLogin: (idToken: string) => Promise<AccountUser>

  isAuthenticated: boolean
  token: string | null
  isLoading: boolean
  error: string | null
  lastAuthCheck: number | null
  isCheckingAuth: boolean
  hasHydrated: boolean
  authRequired: boolean | null
  setHasHydrated: (state: boolean) => void
  checkAuthRequired: () => Promise<boolean>
  login: (password: string) => Promise<boolean>
  logout: () => Promise<void>
  checkAuth: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accountEpoch: 0, mode: 'legacy', firebaseConfig: null, user: null,
      finishAccountLogin: async (idToken) => {
        const { data } = await apiClient.post<{ user: AccountUser }>('/auth/session', { idToken })
        queryClient.clear()
        set({ user: data.user, isAuthenticated: true, token: get().mode === 'firebase' ? null : get().token, accountEpoch: get().accountEpoch + 1, lastAuthCheck: Date.now(), error: null })
        return data.user
      },
      isAuthenticated: false,
      token: null,
      isLoading: false,
      error: null,
      lastAuthCheck: null,
      isCheckingAuth: false,
      hasHydrated: false,
      authRequired: null,

      setHasHydrated: (state: boolean) => {
        set({ hasHydrated: state })
      },

      checkAuthRequired: async () => {
        try {
          const response = await apiClient.get<{ auth_enabled?: boolean; mode?: 'firebase'; firebase?: FirebaseOptions }>('/auth/status', {
            headers: { 'Cache-Control': 'no-store' },
          })

          const required = response.data.auth_enabled || false
          set({ authRequired: required, mode: response.data.mode ?? 'legacy', firebaseConfig: response.data.firebase ?? null })
          if (response.data.mode === 'firebase') {
            set({ token: null, isAuthenticated: false, lastAuthCheck: null })
          }

          // If auth is not required, mark as authenticated
          if (!required) {
            set({ isAuthenticated: true, token: 'not-required' })
          }

          if (response.data.firebase && response.data.mode !== 'firebase') {
            const epoch = get().accountEpoch
            try {
              const account = await apiClient.get<{ user: AccountUser }>('/auth/me')
              if (get().accountEpoch === epoch) set({ user: account.data.user })
            } catch { if (get().accountEpoch === epoch) set({ user: null }) }
          }
          return required
        } catch (error) {
          console.error('Failed to check auth status:', error)

          // If it's a network error, set a more helpful error message
          if (axios.isAxiosError(error) && !error.response) {
            set({
              error: 'Unable to connect to server. Please check if the API is running.',
              authRequired: null  // Don't assume auth is required if we can't connect
            })
          } else {
            // For other errors, default to requiring auth to be safe
            set({ authRequired: true })
          }

          // Re-throw the error so the UI can handle it
          throw error
        }
      },

      login: async (password: string) => {
        set({ isLoading: true, error: null })
        try {
          const apiUrl = await getApiUrl()

          // Deliberately raw fetch (not apiClient): this probes a candidate
          // password, so the interceptors must not overwrite the Authorization
          // header with the stored token or hard-redirect on 401.
          const response = await fetch(`${apiUrl}/api/notebooks`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${password}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (response.ok) {
            set({ 
              isAuthenticated: true, 
              token: password, 
              isLoading: false,
              lastAuthCheck: Date.now(),
              error: null
            })
            return true
          } else {
            let errorMessage = 'Authentication failed'
            if (response.status === 401) {
              errorMessage = 'Invalid password. Please try again.'
            } else if (response.status === 403) {
              errorMessage = 'Access denied. Please check your credentials.'
            } else if (response.status >= 500) {
              errorMessage = 'Server error. Please try again later.'
            } else {
              errorMessage = `Authentication failed (${response.status})`
            }
            
            set({ 
              error: errorMessage,
              isLoading: false,
              isAuthenticated: false,
              token: null
            })
            return false
          }
        } catch (error) {
          console.error('Network error during auth:', error)
          let errorMessage = 'Authentication failed'
          
          if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            errorMessage = 'Unable to connect to server. Please check if the API is running.'
          } else if (error instanceof Error) {
            errorMessage = `Network error: ${error.message}`
          } else {
            errorMessage = 'An unexpected error occurred during authentication'
          }
          
          set({ 
            error: errorMessage,
            isLoading: false,
            isAuthenticated: false,
            token: null
          })
          return false
        }
      },
      
      logout: async () => {
        if (get().mode === 'firebase' || get().firebaseConfig) await apiClient.post('/auth/logout')
        queryClient.clear()
        const local = get().mode === 'legacy' && get().authRequired === false
        set({
          isAuthenticated: local,
          token: local ? 'not-required' : null,
          error: null, user: null, lastAuthCheck: null,
          accountEpoch: get().accountEpoch + 1,
        })
      },

      checkAuth: async () => {
        const state = get()
        const { token, lastAuthCheck, isCheckingAuth, isAuthenticated } = state

        // If already checking, return current auth state
        if (isCheckingAuth) {
          return isAuthenticated
        }

        if (state.mode === 'firebase') {
          set({ isCheckingAuth: true })
          try {
            const { data } = await apiClient.get<{ user: AccountUser }>('/auth/me')
            set({ user: data.user, isAuthenticated: true, isCheckingAuth: false, lastAuthCheck: Date.now() })
            return true
          } catch {
            set({ user: null, isAuthenticated: false, isCheckingAuth: false })
            return false
          }
        }

        // If no token, not authenticated
        if (!token) {
          return false
        }

        // If we checked recently (within 30 seconds) and are authenticated, skip
        const now = Date.now()
        if (isAuthenticated && lastAuthCheck && (now - lastAuthCheck) < 30000) {
          return true
        }

        set({ isCheckingAuth: true })

        try {
          const apiUrl = await getApiUrl()

          // Deliberately raw fetch (not apiClient): a 401 here must update
          // store state, not trigger the interceptor's storage-clear/redirect.
          const response = await fetch(`${apiUrl}/api/notebooks`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (response.ok) {
            set({ 
              isAuthenticated: true, 
              lastAuthCheck: now,
              isCheckingAuth: false 
            })
            return true
          } else {
            set({
              isAuthenticated: false,
              token: null,
              lastAuthCheck: null,
              isCheckingAuth: false
            })
            return false
          }
        } catch (error) {
          console.error('checkAuth error:', error)
          set({ 
            isAuthenticated: false, 
            token: null,
            lastAuthCheck: null,
            isCheckingAuth: false 
          })
          return false
        }
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.mode === 'firebase' ? null : state.token,
        isAuthenticated: state.mode === 'firebase' ? false : state.isAuthenticated
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      }
    }
  )
)