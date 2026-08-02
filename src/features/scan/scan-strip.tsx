import { useState } from 'react'
import { ScanLine, Camera, CheckCircle2, AlertTriangle, CornerDownLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CameraScannerDialog, isCameraScanSupported } from '@/features/scan/camera-scanner'
import { emitManualScan } from '@/features/scan/scan-engine'
import type { ScanFeedback } from '@/features/scan/use-scan-to-basket'
import { cn } from '@/lib/utils'

/**
 * The scan affordance.
 *
 * A USB scanner needs no UI at all — it just types — but a screen that gives no
 * sign it is listening reads as broken until the first successful scan. This
 * says "ready", echoes what landed, and offers the two fallbacks: the camera on
 * a tablet, and typing a code by hand when a barcode is torn.
 */
export function ScanStrip({
  feedback,
  className,
}: {
  feedback: ScanFeedback | null
  className?: string
}) {
  const [cameraOpen, setCameraOpen] = useState(false)
  const [manual, setManual] = useState('')

  function submitManual() {
    const code = manual.trim()
    if (!code) return
    emitManualScan(code)
    setManual('')
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2',
        feedback?.ok === false
          ? 'border-danger/30 bg-danger/5'
          : feedback?.ok
            ? 'border-success/30 bg-success/5'
            : 'border-border bg-surface-muted/40',
        className,
      )}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-md',
          feedback?.ok === false
            ? 'bg-danger/10 text-danger'
            : feedback?.ok
              ? 'bg-success/10 text-success'
              : 'bg-surface text-text-muted',
        )}
      >
        {feedback?.ok === false ? (
          <AlertTriangle className="size-4" />
        ) : feedback?.ok ? (
          <CheckCircle2 className="size-4" />
        ) : (
          <ScanLine className="size-4" />
        )}
      </span>

      <p className="min-w-0 flex-1 text-sm">
        {feedback ? (
          <>
            <span className="font-medium text-text-primary">{feedback.label}</span>
            {feedback.detail && (
              <span className="ml-1.5 text-text-secondary">{feedback.detail}</span>
            )}
          </>
        ) : (
          <span className="text-text-secondary">Ready to scan — just point and shoot.</span>
        )}
      </p>

      <div className="flex items-center gap-1.5">
        <div className="relative">
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitManual()
              }
            }}
            placeholder="Type a code"
            aria-label="Enter a barcode by hand"
            className="h-9 w-36 pr-8"
          />
          {manual && (
            <button
              type="button"
              onClick={submitManual}
              aria-label="Look up code"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <CornerDownLeft className="size-4" />
            </button>
          )}
        </div>
        {isCameraScanSupported() && (
          <Button variant="outline" size="sm" onClick={() => setCameraOpen(true)}>
            <Camera className="size-3.5" /> Camera
          </Button>
        )}
      </div>

      {cameraOpen && <CameraScannerDialog onClose={() => setCameraOpen(false)} />}
    </div>
  )
}
