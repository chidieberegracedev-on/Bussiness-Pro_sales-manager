import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export function ImageUpload({
  previewUrl,
  onSelect,
  onRemove,
  uploading,
  shape = 'square',
  label = 'Image',
}: {
  previewUrl?: string
  onSelect: (file: File) => void
  onRemove?: () => void
  uploading?: boolean
  shape?: 'square' | 'circle'
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (file) onSelect(file)
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
        aria-label={label}
      />
      <div
        className={cn(
          'group relative flex size-28 items-center justify-center overflow-hidden border-2 border-dashed border-border bg-surface-muted transition-colors',
          shape === 'circle' ? 'rounded-full' : 'rounded-lg',
          dragOver && 'border-primary bg-primary/5',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          handleFiles(e.dataTransfer.files)
        }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-6 text-text-muted" aria-hidden="true" />
        )}

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="size-5 animate-spin text-white" />
          </div>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent transition-colors hover:bg-black/40 hover:text-white focus-visible:bg-black/40 focus-visible:text-white focus-visible:outline-none"
        >
          <span className="text-xs font-medium">{previewUrl ? 'Change' : 'Upload'}</span>
        </button>
      </div>

      {previewUrl && onRemove && (
        <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={onRemove}>
          <X className="size-3.5" /> Remove
        </Button>
      )}
    </div>
  )
}
