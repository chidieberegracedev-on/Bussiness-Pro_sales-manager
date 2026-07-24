import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/features/auth/store'
import { AuthLayout } from '@/features/auth/auth-layout'

export function AuthCallbackPage() {
  const session = useAuthStore((s) => s.session)
  const [timedOut, setTimedOut] = useState(false)

  const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search)
  const urlError = params.get('error_description') || params.get('error')

  useEffect(() => {
    if (session) {
      window.location.replace('/')
    }
  }, [session])

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 8000)
    return () => clearTimeout(timer)
  }, [])

  if (urlError || timedOut) {
    return (
      <AuthLayout title="Couldn't confirm your email">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="size-10 text-danger" />
          <p className="text-sm text-text-secondary">
            {urlError ? decodeURIComponent(urlError.replace(/\+/g, ' ')) : 'This confirmation link may have expired.'}
          </p>
          <Link to="/sign-in" className="mt-2 text-sm font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Confirming your email">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Loader2 className="size-8 animate-spin text-text-muted" />
        <p className="text-sm text-text-secondary">One moment…</p>
      </div>
    </AuthLayout>
  )
}
