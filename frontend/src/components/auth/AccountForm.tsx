'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile } from 'firebase/auth'
import { accountAuth } from '@/lib/firebase'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/arc/input/input'
import { BrandMark } from '@/components/layout/BrandMark'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { LiquidSurface } from '@/components/layout/LiquidSurface'

export function AccountForm({ register = false }: { register?: boolean }) {
  const { t } = useTranslation()
  const router = useRouter()
  const { firebaseConfig, finishAccountLogin } = useAuthStore()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [reset, setReset] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [verification, setVerification] = useState(false)
  useEffect(() => { setError(''); setNotice('') }, [register, reset])

  async function complete() {
    if (!firebaseConfig) return
    const auth = await accountAuth(firebaseConfig)
    const user = auth.currentUser
    if (!user) throw new Error('auth/invalid-credential')
    await user.reload()
    if (!user.emailVerified) {
      setVerification(true)
      setNotice(t('account.verifyNotice'))
      return
    }
    const account = await finishAccountLogin(await user.getIdToken(true))
    await signOut(auth)
    const redirect = sessionStorage.getItem('redirectAfterLogin')
    sessionStorage.removeItem('redirectAfterLogin')
    router.replace(account.admin && redirect?.startsWith('/') && !redirect.startsWith('//') && !redirect.includes('\\') ? redirect : '/notebooks')
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await action() } catch (cause) {
      const code = (cause as { code?: string }).code
      const key = code === 'auth/email-already-in-use' ? 'account.emailUsed' :
        code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements' ? 'account.weakPassword' :
        code === 'auth/too-many-requests' ? 'account.tooManyRequests' :
        code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request' ? 'account.popupClosed' : 'account.signInFailed'
      setError(t(key))
    } finally { setBusy(false) }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!firebaseConfig) return
    if (register && password !== confirm) { setError(t('account.passwordMismatch')); return }
    await perform(async () => {
      const auth = await accountAuth(firebaseConfig)
      if (reset) {
        await sendPasswordResetEmail(auth, email.trim())
        setNotice(t('account.resetSent'))
        return
      }
      if (register) {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
        await updateProfile(credential.user, { displayName: name.trim() })
        await sendEmailVerification(credential.user)
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
      await complete()
    })
  }
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <LiquidSurface radius={28} className="w-full max-w-md rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div className="mb-8 flex items-center gap-3"><BrandMark className="size-6" /><span className="text-base font-medium">{t('common.appName')}</span></div>
        <h1 className="text-2xl font-medium tracking-tight">{t(reset ? 'account.resetTitle' : register ? 'account.registerTitle' : 'account.loginTitle')}</h1>
        <p className="mt-2 mb-6 text-sm text-muted-foreground">{t('account.studyTogether')}</p>
        {verification ? <div className="space-y-4">
          <p role="status" className="text-sm">{notice || t('account.verifyNotice')}</p>
          <Button className="w-full" disabled={busy} onClick={() => perform(complete)}>{t('account.checkVerification')}</Button>
          <Button variant="ghost" className="w-full" disabled={busy} onClick={() => perform(async () => {
            const auth = await accountAuth(firebaseConfig!); if (auth.currentUser) await sendEmailVerification(auth.currentUser)
            setNotice(t('account.verificationSent'))
          })}>{t('account.resendVerification')}</Button>
          <Button variant="ghost" className="w-full" disabled={busy} onClick={() => perform(async () => { await signOut(await accountAuth(firebaseConfig!)); setVerification(false); setPassword(''); setNotice('') })}>{t('account.otherAccount')}</Button>
        </div> : <>
          {!reset && <Button variant="outline" className="mb-5 w-full" disabled={busy || !firebaseConfig} onClick={() => perform(async () => {
            const auth = await accountAuth(firebaseConfig!); await signInWithPopup(auth, new GoogleAuthProvider()); await complete()
          })}>{t('account.google')}</Button>}
          <form onSubmit={submit} className="space-y-4">
            {register && !reset && <Input label={t('product.name')} name="name" autoComplete="name" required maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} />}
            <Input label={t('product.email')} type="email" name="email" autoComplete="email" required value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
            {!reset && <Input label={t('auth.passwordPlaceholder')} type="password" name="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 8 : undefined} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />}
            {register && !reset && <Input label={t('account.confirmPassword')} type="password" name="confirm-password" autoComplete="new-password" required minLength={8} value={confirm} disabled={busy} onChange={event => setConfirm(event.target.value)} />}
            <Button type="submit" className="w-full" disabled={busy || !firebaseConfig}>{busy ? <LoadingSpinner /> : t(reset ? 'account.sendReset' : register ? 'account.createAccount' : 'auth.signIn')}</Button>
          </form>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link className="underline underline-offset-4" href={register ? '/account/login' : '/register'}>{t(register ? 'account.haveAccount' : 'account.registerTitle')}</Link>
            <Button variant="ghost" disabled={busy} onClick={() => setReset(!reset)}>{t(reset ? 'account.backToLogin' : 'account.forgotPassword')}</Button>
          </div>
        </>}
        {error && <p className="mt-4 text-sm text-destructive" role="alert">{error}</p>}
        {notice && !verification && <p className="mt-4 text-sm text-muted-foreground" role="status">{notice}</p>}
      </LiquidSurface>
    </main>
  )
}
