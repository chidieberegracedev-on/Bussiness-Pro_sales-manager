import { useEffect, useRef, useState } from 'react'
import { Camera, X, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useScanEngineStore } from '@/features/scan/scan-engine'

/**
 * The camera half of the Scan Engine. Same normalized event out as the
 * keyboard wedge, so no subscriber knows or cares which one fired.
 *
 * Uses the platform BarcodeDetector rather than a bundled decoder: it is
 * hardware-accelerated, it is what Android Chrome will use later, and it costs
 * nothing in bundle size. Where it's missing (Safari, Firefox) we say so
 * plainly instead of degrading into a broken viewfinder — a USB scanner is
 * the answer on those, and the keyboard wedge already handles it.
 */

interface DetectedBarcode {
  rawValue: string
}
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike

function getDetectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  return typeof ctor === 'function' ? ctor : null
}

export function isCameraScanSupported(): boolean {
  return !!getDetectorCtor() && !!navigator.mediaDevices?.getUserMedia
}

export function CameraScannerDialog({ onClose }: { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastCode, setLastCode] = useState<string | null>(null)

  useEffect(() => {
    const Detector = getDetectorCtor()
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setError('unsupported')
      return
    }

    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    // Same code in view for several frames must not fire repeatedly.
    let lastEmitted = ''
    let lastEmittedAt = 0

    const detector = new Detector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'],
    })

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        tick()
      } catch (e) {
        console.error('[camera-scan] getUserMedia failed', e)
        setError('denied')
      }
    }

    async function tick() {
      if (stopped) return
      const video = videoRef.current
      if (video && video.readyState >= 2) {
        try {
          const results = await detector.detect(video)
          const code = results[0]?.rawValue?.trim()
          const now = Date.now()
          if (code && (code !== lastEmitted || now - lastEmittedAt > 1500)) {
            lastEmitted = code
            lastEmittedAt = now
            setLastCode(code)
            useScanEngineStore.getState().emit({ code, source: 'camera', at: now })
          }
        } catch {
          // A frame that fails to decode is the normal case, not an error.
        }
      }
      raf = requestAnimationFrame(() => void tick())
    }

    void start()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-5" /> Scan with camera
          </DialogTitle>
        </DialogHeader>

        {error ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="text-sm">
              <p className="font-medium text-text-primary">
                {error === 'denied' ? 'Camera not available' : 'Not supported on this browser'}
              </p>
              <p className="mt-0.5 text-text-secondary">
                {error === 'denied'
                  ? 'Allow camera access for this site, or use a USB barcode scanner — those work here with no setup.'
                  : 'Camera scanning needs Chrome or Edge. A USB barcode scanner works on any browser — plug it in and scan.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video
                ref={videoRef}
                className="aspect-[4/3] w-full object-cover"
                muted
                playsInline
              />
              {/* Aim guide — a scanner without one invites holding it wrong. */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-24 w-4/5 rounded-lg border-2 border-white/70" />
              </div>
            </div>
            <p className="text-center text-sm text-text-secondary">
              {lastCode ? `Scanned ${lastCode}` : 'Point the camera at a barcode'}
            </p>
          </>
        )}

        <Button variant="outline" onClick={onClose}>
          <X className="size-4" /> Done
        </Button>
      </DialogContent>
    </Dialog>
  )
}
