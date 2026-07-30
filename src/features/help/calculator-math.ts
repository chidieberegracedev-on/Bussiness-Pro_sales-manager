import Decimal from 'decimal.js'

/**
 * All calculator math runs through Decimal — never float (BR-7.1 / §6 of the
 * web spec). Every helper returns a Decimal or null when the inputs are
 * incomplete or would divide by zero.
 */

function dec(v: string): Decimal | null {
  const trimmed = v.trim()
  if (trimmed === '') return null
  try {
    const d = new Decimal(trimmed)
    return d.isFinite() ? d : null
  } catch {
    return null
  }
}

/** Evaluates a flat arithmetic expression with + − × ÷ and precedence. */
export function evaluateExpression(expression: string): Decimal | null {
  const normalized = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').trim()
  if (normalized === '') return null
  // Tokenize into numbers and operators only — no eval, no identifiers.
  const matched = normalized.match(/(\d+\.?\d*|\.\d+|[+\-*/()])/g)
  if (!matched || matched.join('') !== normalized.replace(/\s+/g, '')) return null
  const tokens: string[] = matched

  let pos = 0
  const peek = () => tokens[pos]

  function parseExpr(): Decimal | null {
    let left = parseTerm()
    if (left === null) return null
    while (peek() === '+' || peek() === '-') {
      const op = tokens[pos++]
      const right = parseTerm()
      if (right === null) return null
      left = op === '+' ? left.plus(right) : left.minus(right)
    }
    return left
  }

  function parseTerm(): Decimal | null {
    let left = parseFactor()
    if (left === null) return null
    while (peek() === '*' || peek() === '/') {
      const op = tokens[pos++]
      const right = parseFactor()
      if (right === null) return null
      if (op === '/') {
        if (right.isZero()) return null
        left = left.div(right)
      } else {
        left = left.times(right)
      }
    }
    return left
  }

  function parseFactor(): Decimal | null {
    if (peek() === '(') {
      pos++
      const inner = parseExpr()
      if (inner === null || peek() !== ')') return null
      pos++
      return inner
    }
    if (peek() === '-') {
      pos++
      const operand = parseFactor()
      return operand === null ? null : operand.negated()
    }
    const token = tokens[pos]
    if (token === undefined || !/^(\d|\.)/.test(token)) return null
    pos++
    try {
      return new Decimal(token)
    } catch {
      return null
    }
  }

  const result = parseExpr()
  if (result === null || pos !== tokens.length) return null
  return result.isFinite() ? result : null
}

/** price = cost / (1 − margin%) — margin is a share of the SELLING price. */
export function priceFromMargin(cost: string, marginPercent: string): Decimal | null {
  const c = dec(cost)
  const m = dec(marginPercent)
  if (!c || !m) return null
  const divisor = new Decimal(1).minus(m.div(100))
  if (divisor.lte(0)) return null
  return c.div(divisor)
}

/** The realised margin on a given cost and price. */
export function marginFromPrice(cost: string, price: string): Decimal | null {
  const c = dec(cost)
  const p = dec(price)
  if (!c || !p || p.isZero()) return null
  return p.minus(c).div(p).times(100)
}

/** price = cost × (1 + markup%) — markup is a share of the COST. */
export function priceFromMarkup(cost: string, markupPercent: string): Decimal | null {
  const c = dec(cost)
  const m = dec(markupPercent)
  if (!c || !m) return null
  return c.times(new Decimal(1).plus(m.div(100)))
}

export function markupFromPrice(cost: string, price: string): Decimal | null {
  const c = dec(cost)
  const p = dec(price)
  if (!c || !p || c.isZero()) return null
  return p.minus(c).div(c).times(100)
}

export interface DiscountResult {
  finalPrice: Decimal
  saved: Decimal
}

export function applyDiscount(price: string, discountPercent: string): DiscountResult | null {
  const p = dec(price)
  const d = dec(discountPercent)
  if (!p || !d) return null
  const saved = p.times(d.div(100))
  return { finalPrice: p.minus(saved), saved }
}

export interface ProfitResult {
  unitProfit: Decimal
  totalRevenue: Decimal
  totalCost: Decimal
  totalProfit: Decimal
  marginPercent: Decimal | null
}

export function computeProfit(cost: string, price: string, qty: string): ProfitResult | null {
  const c = dec(cost)
  const p = dec(price)
  const q = dec(qty)
  if (!c || !p || !q) return null
  const unitProfit = p.minus(c)
  return {
    unitProfit,
    totalRevenue: p.times(q),
    totalCost: c.times(q),
    totalProfit: unitProfit.times(q),
    marginPercent: p.isZero() ? null : unitProfit.div(p).times(100),
  }
}

// ---- Unit conversion --------------------------------------------------------
// Pack conversion (cartons ↔ packs) uses an explicit factor, exactly like the
// product/supplier conversion the app already stores. Measure conversion uses
// ratios to a base unit within each family.

export const MEASURE_FAMILIES: Record<string, Record<string, string>> = {
  Weight: { mg: '0.001', g: '1', kg: '1000', oz: '28.349523125', lb: '453.59237' },
  Volume: { ml: '1', l: '1000', 'fl oz': '29.5735295625', pint: '473.176473', quart: '946.352946', gallon: '3785.411784' },
  Length: { mm: '1', cm: '10', m: '1000', in: '25.4', ft: '304.8', yd: '914.4' },
}

export function measureFamilyOf(unit: string): string | null {
  for (const [family, units] of Object.entries(MEASURE_FAMILIES)) {
    if (unit in units) return family
  }
  return null
}

/** Converts between two units of the same measure family. */
export function convertMeasure(value: string, from: string, to: string): Decimal | null {
  const v = dec(value)
  if (!v) return null
  const family = measureFamilyOf(from)
  if (!family || measureFamilyOf(to) !== family) return null
  const units = MEASURE_FAMILIES[family]
  return v.times(units[from]).div(units[to])
}

/** cartons → base units, using the same arithmetic as the product conversion. */
export function packToBase(packQty: string, conversion: string): Decimal | null {
  const q = dec(packQty)
  const c = dec(conversion)
  if (!q || !c || c.lte(0)) return null
  return q.times(c)
}

/** base units → whole cartons + leftover. */
export function baseToPack(
  baseQty: string,
  conversion: string,
): { whole: Decimal; remainder: Decimal; exact: Decimal } | null {
  const q = dec(baseQty)
  const c = dec(conversion)
  if (!q || !c || c.lte(0)) return null
  const exact = q.div(c)
  const whole = exact.floor()
  return { whole, remainder: q.minus(whole.times(c)), exact }
}

/** Trims a Decimal for display without forcing a currency exponent. */
export function formatResult(value: Decimal, maxDp = 6): string {
  return value.toDecimalPlaces(maxDp, Decimal.ROUND_HALF_UP).toString()
}
