'use client'

import { useSyncExternalStore } from 'react'

export interface LocalProfile {
  name: string
  email: string
  bio: string
}
const EMPTY: LocalProfile = { name: '', email: '', bio: '' }
const KEY = 'study-profile-v1'
let rawCache: string | null | undefined
let valueCache = EMPTY
function snapshot() {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === rawCache) return valueCache
    rawCache = raw
    const decoded: unknown = raw ? JSON.parse(raw) : EMPTY
    const parsed =
      decoded && typeof decoded === 'object'
        ? (decoded as Partial<LocalProfile>)
        : EMPTY
    valueCache = {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      bio: typeof parsed.bio === 'string' ? parsed.bio : '',
    }
  } catch {
    valueCache = EMPTY
  }
  return valueCache
}
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback)
  window.addEventListener('study-profile-updated', callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener('study-profile-updated', callback)
  }
}
export function useProfile() {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY)
}
export function saveProfile(profile: LocalProfile) {
  window.localStorage.setItem(KEY, JSON.stringify(profile))
  window.dispatchEvent(new Event('study-profile-updated'))
}
