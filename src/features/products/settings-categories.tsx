import { useState, type FormEvent } from 'react'
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useRenameCategory,
  useSetCategoryIcon,
  ICONS_UNAVAILABLE_REASON,
} from '@/features/products/categories-hooks'
import { CategoryIconPicker } from '@/features/products/category-icon-picker'
import { suggestIconForName } from '@/features/products/category-icons'
import { toReadableError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { TableSkeleton } from '@/components/data/loading-state'
import { toast } from '@/hooks/use-toast'

export function SettingsCategoriesPage() {
  const { data: categories, isLoading, isError, refetch, iconsAvailable } = useCategories()
  const createCategory = useCreateCategory()
  const renameCategory = useRenameCategory()
  const deleteCategory = useDeleteCategory()
  const setCategoryIcon = useSetCategoryIcon()

  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState<string | null>(null)
  // Cleared as soon as the user picks for themselves, so a suggestion never
  // overwrites a deliberate choice on the next keystroke.
  const [iconTouched, setIconTouched] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    try {
      await createCategory.mutateAsync({ name: trimmed, icon: newIcon })
      setNewName('')
      setNewIcon(null)
      setIconTouched(false)
    } catch (error) {
      toast({ variant: 'destructive', title: "Couldn't add category", description: toReadableError(error) })
    }
  }

  async function handleRename(id: string) {
    const trimmed = editingName.trim()
    if (!trimmed) return
    try {
      await renameCategory.mutateAsync({ id, name: trimmed })
      setEditingId(null)
    } catch (error) {
      toast({ variant: 'destructive', title: "Couldn't rename category", description: toReadableError(error) })
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCategory.mutateAsync(id)
    } catch (error) {
      toast({ variant: 'destructive', title: "Couldn't delete category", description: toReadableError(error) })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Categories</CardTitle>
        <CardDescription>Organize products into categories for browsing and filtering.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleCreate} className="flex gap-2">
          <CategoryIconPicker
            value={newIcon}
            onChange={(next) => {
              setIconTouched(true)
              setNewIcon(next)
            }}
            disabled={!iconsAvailable}
          />
          <Input
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value)
              if (!iconTouched) setNewIcon(suggestIconForName(e.target.value)?.key ?? null)
            }}
            placeholder="New category name"
            aria-label="New category name"
          />
          <Button type="submit" disabled={createCategory.isPending || !newName.trim()}>
            {createCategory.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add
          </Button>
        </form>

        {!iconsAvailable && <p className="type-meta">{ICONS_UNAVAILABLE_REASON}</p>}

        {isLoading && <TableSkeleton rows={4} columns={1} />}
        {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

        {categories && categories.length === 0 && (
          <EmptyState title="No categories yet" description="Add your first category above to start organizing products." />
        )}

        {categories && categories.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center gap-2 px-3 py-2">
                {editingId === category.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      autoFocus
                      aria-label={`Rename ${category.name}`}
                      className="h-9"
                    />
                    <Button size="icon" variant="ghost" onClick={() => handleRename(category.id)} aria-label="Save">
                      <Check className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancel">
                      <X className="size-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <CategoryIconPicker
                      value={category.icon}
                      onChange={(icon) =>
                        setCategoryIcon
                          .mutateAsync({ id: category.id, icon })
                          .catch((error) =>
                            toast({
                              variant: 'destructive',
                              title: "Couldn't set the icon",
                              description: toReadableError(error),
                            }),
                          )
                      }
                      disabled={!iconsAvailable}
                      triggerLabel="Icon"
                    />
                    <span className="flex-1 text-sm text-text-primary">{category.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(category.id)
                        setEditingName(category.name)
                      }}
                      aria-label={`Rename ${category.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeletingId(category.id)}
                      aria-label={`Delete ${category.name}`}
                    >
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this category?</AlertDialogTitle>
            <AlertDialogDescription>
              Products in this category will become uncategorized. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingId && handleDelete(deletingId)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
