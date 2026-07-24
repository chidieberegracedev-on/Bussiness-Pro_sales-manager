import { useProfile } from '@/features/auth/use-profile'

/** The user's locale drives separators and ordering; never the business's currency. */
export function useLocale(): string {
  const { data: profile } = useProfile()
  return profile?.locale || navigator.language
}
