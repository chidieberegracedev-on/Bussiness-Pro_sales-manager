import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type DictionaryEntry = Database['public']['Tables']['business_dictionary']['Row']

/**
 * The dictionary is universal content — the same for every user and business —
 * so it is fetched once and cached for the session. The ⓘ lookups then cost
 * nothing (WEB_IMPLEMENTATION §2).
 */
export function useDictionary() {
  return useQuery({
    queryKey: ['dictionary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_dictionary')
        .select('*')
        .order('term', { ascending: true })
      if (error) throw error
      return (data ?? []) as DictionaryEntry[]
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

/** Single-term lookup off the cached dictionary. */
export function useDictionaryTerm(slug: string | undefined) {
  const { data: entries } = useDictionary()
  return useMemo(
    () => (slug ? entries?.find((e) => e.slug === slug) : undefined),
    [entries, slug],
  )
}

export function useDictionaryMap() {
  const { data: entries } = useDictionary()
  return useMemo(() => {
    const map = new Map<string, DictionaryEntry>()
    for (const entry of entries ?? []) map.set(entry.slug, entry)
    return map
  }, [entries])
}
