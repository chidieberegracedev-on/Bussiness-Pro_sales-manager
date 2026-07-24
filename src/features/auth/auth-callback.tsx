import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from '@/features/auth/auth-layout'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const queryParams = new URLSearchParams(window.location.search)

      // Supabase reports an expired/already-used link as a successful redirect
      // carrying error params, not as a thrown exception.
      const errorDescription = hashParams.get('error_description') || queryParams.get('error_description')
      const errorCode = hashParams.get('error') || queryParams.get('error')
      if (errorDescription || errorCode) {
        if (!cancelled) {
          setError(
            errorDescription
              ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
              : 'This confirmation link may have expired.',
          )
        }
        return
      }

      // PKCE flow (current default): ?code=<uuid> must be explicitly exchanged.
      const code = queryParams.get('code')
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          if (!cancelled) setError(exchangeError.message)
          return
        }
      }

      // Implicit flow resolves automatically via detectSessionInUrl before this
      // point; for PKCE the exchange above just completed it. Either way, the
      // session should now be present.
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        if (!cancelled) setError('We could not confirm your email. The link may have expired.')
        return
      }

      if (!cancelled) navigate(queryParams.get('next') ?? '/', { replace: true })
    }

    run()
    return () => {
      cancelled = true
    }
  }, [navigate])

  if (error) {
    return (
      <AuthLayout title="Couldn't confirm your email">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="size-10 text-danger" />
          <p className="text-sm text-text-secondary">{error}</p>
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
