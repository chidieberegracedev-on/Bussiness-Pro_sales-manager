import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from '@/features/auth/auth-layout'
import { AuthErrorState } from '@/features/auth/auth-error-state'

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const query = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))

    // Supabase reports verification failures as parameters on a successful
    // redirect, not as a thrown exception. They arrive in the query string
    // or the fragment depending on the flow, so both must be checked or an
    // expired/reused link shows an infinite spinner instead of a message.
    const failure = query.get('error_description') ?? hash.get('error_description')
    if (failure) {
      setError(decodeURIComponent(failure.replace(/\+/g, ' ')))
      return
    }

    async function run() {
      // getSession() awaits the client's internal initialization promise,
      // which is where detectSessionInUrl performs the PKCE exchange (it
      // reads ?code=, exchanges it, stores the session, and deletes the
      // code verifier). Do NOT also call exchangeCodeForSession here — that
      // would exchange the same code a second time against a verifier that
      // detectSessionInUrl already deleted, producing "PKCE code verifier
      // not found in storage" on an account that in fact confirmed fine.
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (cancelled) return

      if (sessionError) {
        setError(sessionError.message)
        return
      }
      if (!data.session) {
        setError('We could not confirm your email. The link may have expired or already been used.')
        return
      }

      navigate(query.get('next') ?? '/', { replace: true })
    }

    run()
    return () => {
      cancelled = true
    }
  }, [navigate])

  if (error) return <AuthErrorState message={error} />

  return (
    <AuthLayout title="Confirming your email">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Loader2 className="size-8 animate-spin text-text-muted" />
        <p className="text-sm text-text-secondary">One moment…</p>
      </div>
    </AuthLayout>
  )
}
