import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  /** Names the area, so the message says WHERE it broke. */
  area?: string
}

interface State {
  error: Error | null
}

/**
 * Catches render-time throws so a bug shows a message instead of a white page.
 *
 * The app had none. Any exception thrown while rendering — a missing column
 * the UI indexed a lookup table with, a malformed row a renderer assumed the
 * shape of — unmounted the entire tree and left a blank screen with nothing
 * in it. From the outside that is indistinguishable from a dead deploy, a
 * routing bug, or a network failure, so every occurrence cost a round trip
 * just to find out what broke.
 *
 * This does not make the underlying bug less real. It makes it VISIBLE, and it
 * keeps the rest of the app usable while it's fixed.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The real error, with the component stack, so the cause is findable
    // rather than guessable.
    console.error(`[render error${this.props.area ? ` in ${this.props.area}` : ''}]`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-64 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-danger/10 text-danger">
            <AlertTriangle className="size-5" />
          </div>
          <h1 className="text-lg font-semibold text-text-primary">
            This screen couldn't load
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Something in {this.props.area ?? 'this page'} failed while drawing. The rest of the app
            still works — the details are in the browser console.
          </p>

          {/* The message itself, not just in DEV. A blank screen tells the
              person reporting it nothing; one line of cause tells them, and
              us, almost everything. */}
          <p className="mt-3 break-words rounded-md border border-border bg-surface-muted/60 p-2 text-left font-mono text-xs text-text-secondary">
            {error.message}
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={() => this.setState({ error: null })}>
              <RotateCcw className="size-4" /> Try again
            </Button>
            <Button variant="outline" onClick={() => { window.location.href = '/dashboard' }}>
              <Home className="size-4" /> Back to dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
