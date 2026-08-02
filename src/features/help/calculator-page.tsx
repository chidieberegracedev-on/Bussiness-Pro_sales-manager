import { useState } from 'react'
import Decimal from 'decimal.js'
import { Calculator, History, Loader2, Trash2, ArrowRightLeft, Percent, Tag, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Money } from '@/components/money/money'
import { Quantity } from '@/components/quantity/quantity'
import { EmptyState } from '@/components/data/empty-state'
import { StandardKeypad } from '@/features/help/standard-keypad'
import { Term } from '@/features/help/term'
import {
  applyDiscount,
  baseToPack,
  computeProfit,
  convertMeasure,
  formatResult,
  marginFromPrice,
  MEASURE_FAMILIES,
  packToBase,
  priceFromMargin,
  priceFromMarkup,
} from '@/features/help/calculator-math'
import {
  useCalculatorHistory,
  useClearCalculatorHistory,
  useSaveCalculation,
} from '@/features/help/use-calculator-history'
import { useActiveBusiness } from '@/features/business/hooks'
import { useLocale } from '@/features/auth/use-locale'
import { formatDateTime } from '@/lib/format'
import type { CalculatorKind } from '@/types/database'

export function CalculatorPage() {
  const saveCalculation = useSaveCalculation()

  function record(kind: CalculatorKind, expression: string, result: string) {
    saveCalculation.mutate({ kind, expression, result }, { onError: () => undefined })
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Business Calculator"
        description="Everyday arithmetic plus the pricing maths this business needs — margin, markup, discount, pack conversion, and profit."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="standard">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="standard">Standard</TabsTrigger>
                <TabsTrigger value="margin">Margin</TabsTrigger>
                <TabsTrigger value="markup">Markup</TabsTrigger>
                <TabsTrigger value="discount">Discount</TabsTrigger>
                <TabsTrigger value="unit">Units</TabsTrigger>
                <TabsTrigger value="profit">Profit</TabsTrigger>
              </TabsList>

              <TabsContent value="standard" className="mt-4">
                <div className="mx-auto max-w-sm">
                  <StandardKeypad onEvaluated={(e, r) => record('standard', e, r)} />
                </div>
              </TabsContent>

              <TabsContent value="margin" className="mt-4">
                <MarginTab onRecord={record} />
              </TabsContent>

              <TabsContent value="markup" className="mt-4">
                <MarkupTab onRecord={record} />
              </TabsContent>

              <TabsContent value="discount" className="mt-4">
                <DiscountTab onRecord={record} />
              </TabsContent>

              <TabsContent value="unit" className="mt-4">
                <UnitTab onRecord={record} />
              </TabsContent>

              <TabsContent value="profit" className="mt-4">
                <ProfitTab onRecord={record} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <HistoryPanel />
      </div>
    </div>
  )
}

type RecordFn = (kind: CalculatorKind, expression: string, result: string) => void

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
}

function Field({
  label,
  value,
  onChange,
  suffix,
  placeholder,
}: {
  label: React.ReactNode
  value: string
  onChange: (v: string) => void
  suffix?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-sm font-medium text-text-secondary">{label}</label>
      <div className="relative mt-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder ?? '0'}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

function ResultBlock({
  primary,
  primaryLabel,
  secondary,
  onSave,
  saveDisabled,
}: {
  primary: React.ReactNode
  primaryLabel: string
  secondary?: React.ReactNode
  onSave?: () => void
  saveDisabled?: boolean
}) {
  return (
    <div className="mt-4 rounded-lg border border-accent-primary/30 bg-accent-primary/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{primaryLabel}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-text-primary">{primary}</p>
      {secondary && <div className="mt-2 space-y-0.5 text-sm text-text-secondary">{secondary}</div>}
      {onSave && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onSave} disabled={saveDisabled}>
          <History className="size-3.5" /> Save to history
        </Button>
      )}
    </div>
  )
}

function MarginTab({ onRecord }: { onRecord: RecordFn }) {
  const [cost, setCost] = useState('')
  const [margin, setMargin] = useState('')
  const price = priceFromMargin(cost, margin)
  const profit = price ? price.minus(new Decimal(cost || '0')) : null

  return (
    <div>
      <p className="mb-3 text-sm text-text-secondary">
        You know what it cost and the <Term slug="gross-profit">margin</Term> you want — this gives the selling price.
      </p>
      <FieldRow>
        <Field label="Cost" value={cost} onChange={setCost} />
        <Field label="Target margin" value={margin} onChange={setMargin} suffix="%" />
      </FieldRow>
      {price ? (
        <ResultBlock
          primaryLabel="Sell for"
          primary={<Money value={price.toFixed(4)} />}
          secondary={
            <>
              <p>
                Profit per unit: <Money value={profit!.toFixed(4)} />
              </p>
              <p className="text-xs text-text-muted">price = cost ÷ (1 − margin%)</p>
            </>
          }
          onSave={() =>
            onRecord('margin', `cost ${cost} at ${margin}% margin`, formatResult(price))
          }
        />
      ) : (
        <p className="mt-4 text-sm text-text-muted">
          Enter a cost and a margin below 100% to see the selling price.
        </p>
      )}
    </div>
  )
}

function MarkupTab({ onRecord }: { onRecord: RecordFn }) {
  const [cost, setCost] = useState('')
  const [markup, setMarkup] = useState('')
  const price = priceFromMarkup(cost, markup)
  const realisedMargin = price ? marginFromPrice(cost, price.toString()) : null

  return (
    <div>
      <p className="mb-3 text-sm text-text-secondary">
        Markup is a percentage added on top of your cost (margin is a share of the selling price — they differ).
      </p>
      <FieldRow>
        <Field label="Cost" value={cost} onChange={setCost} />
        <Field label="Markup" value={markup} onChange={setMarkup} suffix="%" />
      </FieldRow>
      {price ? (
        <ResultBlock
          primaryLabel="Sell for"
          primary={<Money value={price.toFixed(4)} />}
          secondary={
            <>
              {realisedMargin && (
                <p>That is a margin of {formatResult(realisedMargin, 2)}% of the selling price.</p>
              )}
              <p className="text-xs text-text-muted">price = cost × (1 + markup%)</p>
            </>
          }
          onSave={() => onRecord('markup', `cost ${cost} + ${markup}% markup`, formatResult(price))}
        />
      ) : (
        <p className="mt-4 text-sm text-text-muted">Enter a cost and a markup percentage.</p>
      )}
    </div>
  )
}

function DiscountTab({ onRecord }: { onRecord: RecordFn }) {
  const [price, setPrice] = useState('')
  const [discount, setDiscount] = useState('')
  const [cost, setCost] = useState('')
  const result = applyDiscount(price, discount)
  const marginAfter = result && cost ? marginFromPrice(cost, result.finalPrice.toString()) : null

  return (
    <div>
      <p className="mb-3 text-sm text-text-secondary">
        Check what a discount leaves you — add your cost to see whether the margin still holds.
      </p>
      <FieldRow>
        <Field label="Price" value={price} onChange={setPrice} />
        <Field label="Discount" value={discount} onChange={setDiscount} suffix="%" />
      </FieldRow>
      <div className="mt-3 max-w-xs">
        <Field label="Your cost (optional)" value={cost} onChange={setCost} />
      </div>
      {result ? (
        <ResultBlock
          primaryLabel="Customer pays"
          primary={<Money value={result.finalPrice.toFixed(4)} />}
          secondary={
            <>
              <p>
                Discount given: <Money value={result.saved.toFixed(4)} />
              </p>
              {marginAfter && (
                <p className={marginAfter.lt(0) ? 'font-medium text-danger' : 'text-text-secondary'}>
                  Margin after discount: {formatResult(marginAfter, 2)}%
                  {marginAfter.lt(0) && ' — this sells below cost'}
                </p>
              )}
            </>
          }
          onSave={() =>
            onRecord('discount', `${price} less ${discount}%`, formatResult(result.finalPrice))
          }
        />
      ) : (
        <p className="mt-4 text-sm text-text-muted">Enter a price and a discount percentage.</p>
      )}
    </div>
  )
}

function UnitTab({ onRecord }: { onRecord: RecordFn }) {
  const [mode, setMode] = useState<'pack' | 'measure'>('pack')

  // Pack mode — the same arithmetic the product/supplier conversion uses.
  const [packQty, setPackQty] = useState('')
  const [conversion, setConversion] = useState('')
  const [direction, setDirection] = useState<'toBase' | 'toPack'>('toBase')
  const toBase = packToBase(packQty, conversion)
  const toPack = baseToPack(packQty, conversion)

  // Measure mode — weight / volume / length within one family.
  const [family, setFamily] = useState<string>('Weight')
  const [measureValue, setMeasureValue] = useState('')
  const [fromUnit, setFromUnit] = useState('kg')
  const [toUnit, setToUnit] = useState('g')
  const converted = convertMeasure(measureValue, fromUnit, toUnit)
  const familyUnits = Object.keys(MEASURE_FAMILIES[family] ?? {})

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setMode('pack')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
            mode === 'pack' ? 'bg-card text-text-primary' : 'text-text-secondary'
          }`}
        >
          Packs &amp; cartons
        </button>
        <button
          type="button"
          onClick={() => setMode('measure')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
            mode === 'measure' ? 'bg-card text-text-primary' : 'text-text-secondary'
          }`}
        >
          Weight, volume, length
        </button>
      </div>

      {mode === 'pack' ? (
        <div>
          <p className="mb-3 text-sm text-text-secondary">
            The same conversion the app uses for <Term slug="average-cost">average cost</Term> — how many base units
            are in a purchase unit.
          </p>
          <div className="mb-3 flex gap-1 rounded-lg border border-border bg-surface-muted p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDirection('toBase')}
              className={`flex-1 rounded px-2 py-1 font-medium ${
                direction === 'toBase' ? 'bg-card text-text-primary' : 'text-text-muted'
              }`}
            >
              Cartons → units
            </button>
            <button
              type="button"
              onClick={() => setDirection('toPack')}
              className={`flex-1 rounded px-2 py-1 font-medium ${
                direction === 'toPack' ? 'bg-card text-text-primary' : 'text-text-muted'
              }`}
            >
              Units → cartons
            </button>
          </div>
          <FieldRow>
            <Field
              label={direction === 'toBase' ? 'Cartons' : 'Base units'}
              value={packQty}
              onChange={setPackQty}
            />
            <Field label="Units per carton" value={conversion} onChange={setConversion} />
          </FieldRow>
          {direction === 'toBase' && toBase ? (
            <ResultBlock
              primaryLabel="Base units"
              primary={<Quantity value={toBase.toString()} />}
              secondary={<p className="text-xs text-text-muted">{packQty} × {conversion}</p>}
              onSave={() => onRecord('unit', `${packQty} cartons × ${conversion}`, formatResult(toBase))}
            />
          ) : direction === 'toPack' && toPack ? (
            <ResultBlock
              primaryLabel="Cartons"
              primary={
                <>
                  <Quantity value={toPack.whole.toString()} />
                  {!toPack.remainder.isZero() && (
                    <span className="ml-2 text-base font-normal text-text-secondary">
                      + <Quantity value={toPack.remainder.toString()} /> left over
                    </span>
                  )}
                </>
              }
              secondary={
                <p className="text-xs text-text-muted">
                  exact: {formatResult(toPack.exact)} cartons
                </p>
              }
              onSave={() => onRecord('unit', `${packQty} units ÷ ${conversion}`, formatResult(toPack.exact))}
            />
          ) : (
            <p className="mt-4 text-sm text-text-muted">
              Enter a quantity and a conversion greater than zero.
            </p>
          )}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-text-secondary">Type</label>
              <Select
                value={family}
                onValueChange={(v) => {
                  setFamily(v)
                  const units = Object.keys(MEASURE_FAMILIES[v])
                  setFromUnit(units[0])
                  setToUnit(units[1] ?? units[0])
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue>{family}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(MEASURE_FAMILIES).map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field label="Amount" value={measureValue} onChange={setMeasureValue} />
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-sm font-medium text-text-secondary">From</label>
                <Select value={fromUnit} onValueChange={setFromUnit}>
                  <SelectTrigger className="mt-1">
                    <SelectValue>{fromUnit}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {familyUnits.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                aria-label="Swap units"
                className="mb-0.5 rounded-md border border-border p-2 text-text-muted transition-colors hover:text-accent-primary"
                onClick={() => {
                  setFromUnit(toUnit)
                  setToUnit(fromUnit)
                }}
              >
                <ArrowRightLeft className="size-4" />
              </button>
              <div className="flex-1">
                <label className="text-sm font-medium text-text-secondary">To</label>
                <Select value={toUnit} onValueChange={setToUnit}>
                  <SelectTrigger className="mt-1">
                    <SelectValue>{toUnit}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {familyUnits.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          {converted ? (
            <ResultBlock
              primaryLabel={`In ${toUnit}`}
              primary={
                <>
                  {formatResult(converted)} <span className="text-lg font-normal text-text-secondary">{toUnit}</span>
                </>
              }
              secondary={
                <p className="text-xs text-text-muted">
                  {measureValue} {fromUnit} = {formatResult(converted)} {toUnit}
                </p>
              }
              onSave={() =>
                onRecord('unit', `${measureValue} ${fromUnit} → ${toUnit}`, formatResult(converted))
              }
            />
          ) : (
            <p className="mt-4 text-sm text-text-muted">Enter an amount to convert.</p>
          )}
        </div>
      )}
    </div>
  )
}

function ProfitTab({ onRecord }: { onRecord: RecordFn }) {
  const [cost, setCost] = useState('')
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('')
  const result = computeProfit(cost, price, qty)

  return (
    <div>
      <p className="mb-3 text-sm text-text-secondary">
        A quick <Term slug="gross-profit">gross profit</Term> estimate. Costs here should be per base unit — the same
        basis the ledger uses.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Cost per unit" value={cost} onChange={setCost} />
        <Field label="Price per unit" value={price} onChange={setPrice} />
        <Field label="Quantity" value={qty} onChange={setQty} />
      </div>
      {result ? (
        <ResultBlock
          primaryLabel="Total profit"
          primary={
            <span className={result.totalProfit.gte(0) ? 'text-success' : 'text-danger'}>
              <Money value={result.totalProfit.toFixed(4)} />
            </span>
          }
          secondary={
            <>
              <p>
                Revenue <Money value={result.totalRevenue.toFixed(4)} /> − cost{' '}
                <Money value={result.totalCost.toFixed(4)} />
              </p>
              <p>
                Per unit: <Money value={result.unitProfit.toFixed(4)} />
                {result.marginPercent && ` · margin ${formatResult(result.marginPercent, 2)}%`}
              </p>
            </>
          }
          onSave={() =>
            onRecord('profit', `${qty} × (${price} − ${cost})`, formatResult(result.totalProfit))
          }
        />
      ) : (
        <p className="mt-4 text-sm text-text-muted">Enter cost, price, and quantity.</p>
      )}
    </div>
  )
}

const KIND_META: Record<CalculatorKind, { label: string; icon: typeof Calculator }> = {
  standard: { label: 'Standard', icon: Calculator },
  margin: { label: 'Margin', icon: Percent },
  markup: { label: 'Markup', icon: TrendingUp },
  discount: { label: 'Discount', icon: Tag },
  unit: { label: 'Units', icon: ArrowRightLeft },
  profit: { label: 'Profit', icon: TrendingUp },
}

function HistoryPanel() {
  const { business } = useActiveBusiness()
  const locale = useLocale()
  const { data: history, isLoading } = useCalculatorHistory()
  const clearHistory = useClearCalculatorHistory()

  return (
    <Card className="h-fit">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" /> History
        </CardTitle>
        {history && history.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearHistory.mutate()}
            disabled={clearHistory.isPending}
          >
            {clearHistory.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            Clear
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-40 w-full" />}
        {!isLoading && (!history || history.length === 0) && (
          <EmptyState
            icon={History}
            title="No calculations yet"
            description="Saved calculations appear here, private to you."
          />
        )}
        {!isLoading && history && history.length > 0 && (
          <ul className="divide-y divide-border">
            {history.map((row) => {
              const meta = KIND_META[row.kind] ?? KIND_META.standard
              const Icon = meta.icon
              return (
                <li key={row.id} className="py-2.5">
                  <div className="flex items-center gap-2">
                    <Icon className="size-3.5 shrink-0 text-text-muted" />
                    <span className="text-xs font-medium text-text-muted">{meta.label}</span>
                  </div>
                  <p className="mt-0.5 break-all font-mono text-xs text-text-secondary">
                    {row.expression}
                  </p>
                  <p className="break-all font-mono text-sm font-semibold text-text-primary">
                    = {row.result}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {business ? formatDateTime(row.created_at, business.timezone, locale) : row.created_at}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
