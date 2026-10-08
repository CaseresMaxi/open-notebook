import { LoginForm } from '@/components/auth/LoginForm'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

export default function LoginPage() {
  return (
    <ErrorBoundary>
      <div className="product-shell"><LoginForm /></div>
    </ErrorBoundary>
  )
}