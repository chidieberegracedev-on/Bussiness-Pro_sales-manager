import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Loader2, MailCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toReadableError } from '@/lib/errors'
import { AuthLayout } from '@/features/auth/auth-layout'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// PKCE binds confirmation to the browser that started sign-up (the code
// verifier lives in that browser's localStorage). Signing up on one device
// and confirming on another always produces this error, legitimately — it
// is not a system fault, and the message must say so rather than implying
// something is broken.
function isVerifierMissing(message: string): boolean {
  return message.toLowerCase().includes('code verifier')
}

/**
 * A resend action is required on every path through this screen — a dead
 * end here means a lost account, since the failed link is now unusable.
 */
export function AuthErrorState({ message }: { message: string }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resendError, setResendError] = useState<string | null>(null)
  const verifierMissing = isVerifierMissing(message)

  async function handleResend(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setStatus('sending')
    setResendError(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email: trimmed })
    if (error) {
      setResendError(toReadableError(error))
      setStatus('idle')
      return
    }
    setStatus('sent')
  }

  return (
    <AuthLayout title={verifierMissing ? 'Open this link in the same browser' : "We couldn't confirm your email"}>
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertCircle className="size-10 text-danger" />
        <p className="text-sm text-text-secondary">
          {verifierMissing
            ? 'For security, confirmation must happen in the browser where you created your account. Open this email there, or request a new link below.'
            : message}
        </p>

        {status === 'sent' ? (
          <div className="flex flex-col items-center gap-2 text-success">
            <MailCheck className="size-6" />
            <p className="text-sm font-medium">Check your email for a new confirmation link.</p>
          </div>
        ) : (
          <form onSubmit={handleResend} className="w-full space-y-2 text-left">
            <label htmlFor="resend-email" className="sr-only">
              Email address
            </label>
            <Input
              id="resend-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {resendError && (
              <p role="alert" className="text-sm font-medium text-danger">
                {resendError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={status === 'sending' || !email.trim()}>
              {status === 'sending' && <Loader2 className="size-4 animate-spin" />}
              Send a new link
            </Button>
          </form>
        )}

        <Link to="/sign-in" className="mt-2 text-sm font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  )
}
