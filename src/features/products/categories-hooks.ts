import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useActiveBusiness } from '@/features/business/hooks'

export interface Category {
  id: string
  name: string
  icon: string | null
}

/**
 * Postgres "column does not exist". `product_categories.icon` is an additive
 * migration that ships separately from this code, so the app has to run
 * correctly on both sides of it: with the column, icons work; without it, the
 * screens still load and the icon controls say plainly why they are inert
 * rather than silently accepting a choice that is never stored.
 */
const UNDEFINED_COLUMN = '42703'

/**
 * `src/types/database.ts` is generated from the live schema, and the live schema
 * does not have `product_categories.icon` yet — so the typed client rejects both
 * selecting and writing it. Rather than hand-edit a generated file to describe a
 * column that is not there, the icon-aware calls go through this untyped view of
 * the client. The runtime guard above is what actually decides whether the
 * column exists; this only stops the compiler from blocking code that is
 * deliberately written to work on both sides of the migration.
 *
 * Delete this the moment the migration lands and the types are regenerated.
 */
const untyped = supabase as unknown as {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: unknown[] | null; error: { code: string } | null }>
      }
    }
    insert: (payload: Record<string, unknown>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: unknown; error: { code: string } | null }>
      }
    }
    update: (patch: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { code: string } | null }>
    }
  }
}

export const ICONS_UNAVAILABLE_REASON =
  'Category icons need the product_categories.icon column, which has not been applied to this database yet. Names still work; icons switch on the moment the migration lands.'

/** Set once the first read tells us whether the column is really there. */
let iconColumnPresent: boolean | null = null

export function useCategories() {
  const { business } = useActiveBusiness()

  const query = useQuery({
    queryKey: ['categories', business?.id],
    queryFn: async (): Promise<{ rows: Category[]; icons: boolean }> => {
      const withIcon = await untyped
        .from('product_categories')
        .select('id, name, icon')
        .eq('business_id', business!.id)
        .order('name', { ascending: true })

      if (!withIcon.error) {
        iconColumnPresent = true
        const rows = (withIcon.data ?? []) as Array<{ id: string; name: string; icon: string | null }>
        return { rows: rows.map((r) => ({ id: r.id, name: r.name, icon: r.icon ?? null })), icons: true }
      }
      if (withIcon.error.code !== UNDEFINED_COLUMN) throw withIcon.error

      iconColumnPresent = false
      const { data, error } = await supabase
        .from('product_categories')
        .select('id, name')
        .eq('business_id', business!.id)
        .order('name', { ascending: true })
      if (error) throw error
      const rows = (data ?? []) as Array<{ id: string; name: string }>
      return { rows: rows.map((r) => ({ id: r.id, name: r.name, icon: null })), icons: false }
    },
    enabled: !!business,
  })

  // Callers that only want the list keep reading `data` as an array, exactly as
  // before; the icon-capability flag rides alongside it.
  return {
    ...query,
    data: query.data?.rows,
    iconsAvailable: query.data?.icons ?? false,
  }
}

/** Whether icons can be stored, for code paths outside a query subscription. */
export function categoryIconsAvailable(): boolean {
  return iconColumnPresent === true
}

export function useCreateCategory() {
  const { business } = useActiveBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: string | { name: string; icon?: string | null }) => {
      const name = (typeof input === 'string' ? input : input.name).trim()
      const icon = typeof input === 'string' ? null : (input.icon ?? null)

      const payload: Record<string, unknown> = { business_id: business!.id, name }
      // Only send the column when it exists. Posting an unknown column fails the
      // whole insert, which would turn "icons aren't migrated yet" into
      // "categories can't be created" — a much worse failure.
      if (icon && iconColumnPresent) payload.icon = icon

      const { data, error } = await untyped
        .from('product_categories')
        .insert(payload)
        .select(iconColumnPresent ? 'id, name, icon' : 'id, name')
        .single()
      if (error) throw error
      const row = data as { id: string; name: string; icon?: string | null }
      return { id: row.id, name: row.name, icon: row.icon ?? null } satisfies Category
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', business?.id] }),
  })
}

export function useRenameCategory() {
  const { business } = useActiveBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('product_categories').update({ name: name.trim() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', business?.id] }),
  })
}

export function useSetCategoryIcon() {
  const { business } = useActiveBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, icon }: { id: string; icon: string | null }) => {
      const { error } = await untyped.from('product_categories').update({ icon }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', business?.id] }),
  })
}

export function useDeleteCategory() {
  const { business } = useActiveBusiness()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('product_categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', business?.id] }),
  })
}
