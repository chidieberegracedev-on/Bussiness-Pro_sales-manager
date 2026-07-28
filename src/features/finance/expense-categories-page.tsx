import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2, Pencil, Plus, ArrowLeft, X, Archive, ArchiveRestore } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import {
  useExpenseCategories,
  useCreateExpenseCategory,
  useUpdateExpenseCategory,
} from '@/features/finance/use-expense-categories'
import { toReadableError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/data/empty-state'
import { ErrorState } from '@/components/data/error-state'
import { TableSkeleton } from '@/components/data/loading-state'
import { toast } from '@/hooks/use-toast'

export function ExpenseCategoriesPage() {
  const navigate = useNavigate()
  const { data: categories, isLoading, isError, refetch } = useExpenseCategories(true)
  const create = useCreateExpenseCategory()
  const update = useUpdateExpenseCategory()

  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    try {
      await create.mutateAsync(trimmed)
      setNewName('')
    } catch (error) {
      toast({ variant: 'destructive', title: "Couldn't add category", description: toReadableError(error) })
    }
  }

  async function handleRename(id: string) {
    const trimmed = editingName.trim()
    if (!trimmed) return
    try {
      await update.mutateAsync({ id, name: trimmed })
      setEditingId(null)
    } catch (error) {
      toast({ variant: 'destructive', title: "Couldn't rename category", description: toReadableError(error) })
    }
  }

  async function toggleActive(id: string, active: boolean) {
    try {
      await update.mutateAsync({ id, is_active: active })
    } catch (error) {
      toast({ variant: 'destructive', title: "Couldn't update category", description: toReadableError(error) })
    }
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/expenses')}>
        <ArrowLeft className="size-4" /> Expenses
      </Button>
      <PageHeader title="Expense categories" description="Group expenses for quicker entry and clearer reporting." />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <form onSubmit={handleCreate} className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New category (e.g. Utilities)"
              aria-label="New category name"
            />
            <Button type="submit" disabled={create.isPending || !newName.trim()}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </Button>
          </form>

          {isLoading && <TableSkeleton rows={4} columns={1} />}
          {isError && <ErrorState error={new Error('load')} onRetry={() => refetch()} />}

          {categories && categories.length === 0 && (
            <EmptyState title="No categories yet" description="Add categories to group your expenses." />
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
                      <span className="flex-1 text-sm text-text-primary">
                        {category.name}
                        {!category.is_active && (
                          <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
                            Inactive
                          </span>
                        )}
                      </span>
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
                        onClick={() => toggleActive(category.id, !category.is_active)}
                        aria-label={category.is_active ? 'Deactivate' : 'Reactivate'}
                      >
                        {category.is_active ? (
                          <Archive className="size-4" />
                        ) : (
                          <ArchiveRestore className="size-4" />
                        )}
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
