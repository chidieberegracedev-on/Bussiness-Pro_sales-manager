import { Info } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { useHelpHintsStore } from '@/features/help/help-hints-store'

export function SettingsAppearancePage() {
  const hintsEnabled = useHelpHintsStore((s) => s.enabled)
  const setHintsEnabled = useHelpHintsStore((s) => s.setEnabled)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how Business Pro looks on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Help hints</CardTitle>
          <CardDescription>
            Small ⓘ icons next to business terms, explaining them without leaving the page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
                <Info className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-medium text-text-primary">
                  Show help hints (ⓘ icons)
                </span>
                <span className="mt-0.5 block text-sm text-text-secondary">
                  On by default. Turn this off for a cleaner interface once the terms are familiar —
                  the dictionary stays available from Help &amp; Learning either way.
                </span>
              </span>
            </span>
            <Switch
              checked={hintsEnabled}
              onCheckedChange={setHintsEnabled}
              aria-label="Show help hints"
            />
          </label>
        </CardContent>
      </Card>
    </div>
  )
}
