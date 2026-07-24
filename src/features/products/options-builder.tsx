import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'
import {
  COMBINATION_BLOCK_THRESHOLD,
  COMBINATION_WARN_THRESHOLD,
  combinationCount,
  generateCombinations,
} from '@/features/products/combinations'

export interface OptionDef {
  name: string
  valuesText: string
}

export function OptionsBuilder({
  optionDefs,
  onOptionDefsChange,
  onGenerate,
}: {
  optionDefs: OptionDef[]
  onOptionDefsChange: (defs: OptionDef[]) => void
  onGenerate: (optionNames: string[], combinations: string[][]) => void
}) {
  const [error, setError] = useState<string | null>(null)

  function updateDef(index: number, patch: Partial<OptionDef>) {
    onOptionDefsChange(optionDefs.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  function addOption() {
    if (optionDefs.length >= 3) return
    onOptionDefsChange([...optionDefs, { name: '', valuesText: '' }])
  }

  function removeOption(index: number) {
    onOptionDefsChange(optionDefs.filter((_, i) => i !== index))
  }

  function handleGenerate() {
    setError(null)
    const names: string[] = []
    const valueLists: string[][] = []

    for (const def of optionDefs) {
      const name = def.name.trim()
      const values = Array.from(new Set(def.valuesText.split(',').map((v) => v.trim()).filter(Boolean)))
      if (!name || values.length === 0) {
        setError('Give every option a name and at least one value.')
        return
      }
      names.push(name)
      valueLists.push(values)
    }

    if (names.length === 0) {
      setError('Add at least one option.')
      return
    }

    const count = combinationCount(valueLists)
    if (count > COMBINATION_BLOCK_THRESHOLD) {
      setError(`That's ${count} combinations — reduce values to 200 or fewer.`)
      return
    }
    if (count > COMBINATION_WARN_THRESHOLD) {
      toast({
        title: `Generated ${count} combinations`,
        description: 'That is a lot of variants to review — consider narrowing your options.',
      })
    }

    onGenerate(names, generateCombinations(valueLists))
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      {optionDefs.map((def, index) => (
        <div key={index} className="flex items-end gap-2">
          <div className="w-36 shrink-0">
            <Label htmlFor={`option-name-${index}`}>Option name</Label>
            <Input
              id={`option-name-${index}`}
              value={def.name}
              onChange={(e) => updateDef(index, { name: e.target.value })}
              placeholder="Size"
            />
          </div>
          <div className="flex-1">
            <Label htmlFor={`option-values-${index}`}>Values (comma-separated)</Label>
            <Input
              id={`option-values-${index}`}
              value={def.valuesText}
              onChange={(e) => updateDef(index, { valuesText: e.target.value })}
              placeholder="S, M, L"
            />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(index)} aria-label="Remove option">
            <Trash2 className="size-4 text-danger" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        {optionDefs.length < 3 && (
          <Button type="button" variant="outline" size="sm" onClick={addOption}>
            <Plus className="size-4" /> Add option
          </Button>
        )}
        <Button type="button" size="sm" onClick={handleGenerate} disabled={optionDefs.length === 0}>
          Generate combinations
        </Button>
      </div>

      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </div>
  )
}
