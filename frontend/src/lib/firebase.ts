'use client'

import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAuth, inMemoryPersistence, setPersistence } from 'firebase/auth'

let authPromise: ReturnType<typeof initializeAuth> | undefined
async function initializeAuth(config: FirebaseOptions) {
  const app = getApps().find(app => app.name === 'nextnootbook') ?? initializeApp(config, 'nextnootbook')
  const auth = getAuth(app)
  // The server owns the durable session. ID tokens never go into localStorage.
  await setPersistence(auth, inMemoryPersistence)
  return auth
}
export function accountAuth(config: FirebaseOptions) {
  authPromise ??= initializeAuth(config)
  return authPromise
}

export interface AccountUser {
  uid: string
  email: string
  name: string
  emailVerified: boolean
  admin: boolean
}
