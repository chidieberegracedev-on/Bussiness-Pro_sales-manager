import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useCategories,
  useCreateCategory,
  ICONS_UNAVAILABLE_REASON,
} from '@/features/products/categories-hooks'
import {
  CategoryIconPicker,
  CategoryIconGlyph,
} from '@/features/products/category-icon-picker'
import { suggestIconForName } from '@/features/products/category-icons'
import { toReadableError } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'

const CREATE_VALUE = '__create__'

/**
 * The category select, with creation built in.
 *
 * Leaving a half-filled product form to go and make a category is how products
 * end up mis-filed or abandoned: the cost of doing it properly is a context
 * switch, so people take the wrong option that is already on screen. Creating
 * inline and returning with the new category ALREADY SELECTED removes that
 * choice — the correct path is now the cheap one.
 */
export function CategoryField({
  value,
  onChange,
  id,
}: {
  /** '' or 'none' both mean no category, matching the existing form values. */
  value: string
  onChange: (categoryId: string) => void
  id?: string
}) {
  const { data: categories, iconsAvailable } = useCategories()
  const [creating, setCreating] = useState(false)

  const selected = categories?.find((c) => c.id === value)

  return (
    <>
      <Select
        value={value || 'none'}
        onValueChange={(next) => {
          if (next === CREATE_VALUE) {
            setCreating(true)
            return
          }
          onChange(next === 'none' ? '' : next)
        }}
      >
        <SelectTrigger id={id}>
          {/* The label is rendered as children rather than left to SelectValue's
              own lookup: on an edit form the product resolves before the
              categories do, so at the moment categoryId is set there is no
              matching SelectItem yet, and Radix never re-resolves the label once
              they mount (Fix 009 §Issue 1). */}
          <SelectValue placeholder="No category">
            <span className="flex items-center gap-2">
              <CategoryIconGlyph icon={selected?.icon} />
              {selected?.name ?? 'No category'}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No category</SelectItem>
          {categories?.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              <span className="flex items-center gap-2">
                <CategoryIconGlyph icon={category.icon} />
                {category.name}
              </span>
            </SelectItem>
          ))}
          <SelectItem value={CREATE_VALUE}>
            <span className="flex items-center gap-2 font-medium text-accent">
              <Plus className="size-4" /> Create category
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <CreateCategoryDialog
        open={creating}
        onOpenChange={setCreating}
        iconsAvailable={iconsAvailable}
        onCreated={(category) => onChange(category.id)}
      />
    </>
  )
}

/**
 * The lightweight create: a name and an icon, nothing else. Anything heavier
 * would be the context switch this exists to avoid.
 */
export function CreateCategoryDialog({
  open,
  onOpenChange,
  onCreated,
  iconsAvailable,
  initialName = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (category: { id: string; name: string; icon: string | null }) => void
  iconsAvailable: boolean
  initialName?: string
}) {
  const createCategory = useCreateCategory()
  const [name, setName] = useState(initialName)
  const [icon, setIcon] = useState<string | null>(null)
  // Once the user picks an icon themselves, stop second-guessing them: further
  // typing must not overwrite a deliberate choice with a suggestion.
  const iconTouched = useRef(false)

  useEffect(() => {
    if (open) {
      setName(initialName)
      setIcon(null)
      iconTouched.current = false
    }
  }, [open, initialName])

  function handleName(next: string) {
    setName(next)
    if (!iconTouched.current) {
      setIcon(suggestIconForName(next)?.key ?? null)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      const created = await createCategory.mutateAsync({ name: trimmed, icon })
      onCreated(created)
      onOpenChange(false)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: "Couldn't create category",
        description: toReadableError(error),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>
              It will be selected as soon as it is saved — you stay where you are.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-category-name">Name</Label>
              <div className="flex gap-2">
                <CategoryIconPicker
                  value={icon}
                  onChange={(next) => {
                    iconTouched.current = true
                    setIcon(next)
                  }}
                  disabled={!iconsAvailable}
                  disabledReason={undefined}
                />
                <Input
                  id="new-category-name"
                  value={name}
                  onChange={(e) => handleName(e.target.value)}
                  placeholder="Bread, Plumbing, Hair care…"
                  autoFocus
                />
              </div>
              {!iconsAvailable && <p className="type-meta">{ICONS_UNAVAILABLE_REASON}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || createCategory.isPending}>
              {createCategory.isPending && <Loader2 className="size-4 animate-spin" />}
              Create and select
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
