/**
 * Code 128 (subset B) encoder → SVG.
 *
 * A product label without a scannable barcode is a sticker, so this has to be
 * correct rather than decorative. Code 128B covers the full printable ASCII
 * range, which is what internal SKUs use; manufacturer EAN/UPC codes are
 * printed as-is by the label because those already exist on the packaging.
 *
 * Encoding is fully specified, so this is deterministic and testable: pattern
 * table → checksum → bar widths. No dependency, no canvas, no runtime cost
 * beyond string building.
 */

// Bar/space widths for values 0–106. Each entry is six digits: bar, space,
// bar, space, bar, space. Straight from the Code 128 specification.
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '233111',
]

const START_B = 104
const STOP = 106

/** Code 128B maps printable ASCII 32–126 to values 0–94. */
function charValue(char: string): number | null {
  const code = char.charCodeAt(0)
  if (code < 32 || code > 126) return null
  return code - 32
}

export function isEncodableCode128(value: string): boolean {
  return value.length > 0 && [...value].every((c) => charValue(c) !== null)
}

/**
 * Renders the code as an SVG string. Returns null for anything Code 128B
 * cannot represent, so the caller can fall back to printing the digits rather
 * than emitting a barcode that scans as the wrong thing.
 */
export function code128Svg(
  value: string,
  options: { width?: number; height?: number; showText?: boolean } = {},
): string | null {
  const values: number[] = []
  for (const char of value) {
    const v = charValue(char)
    if (v === null) return null
    values.push(v)
  }
  if (values.length === 0) return null

  // Checksum: start value plus each symbol weighted by position, mod 103.
  let checksum = START_B
  values.forEach((v, i) => {
    checksum += v * (i + 1)
  })
  checksum %= 103

  const symbols = [START_B, ...values, checksum, STOP]

  // Bars alternate starting with a bar. The stop pattern carries a trailing
  // 7th bar of width 2 that closes the symbol.
  const widths: number[] = []
  for (const symbol of symbols) {
    for (const digit of PATTERNS[symbol]) widths.push(Number(digit))
  }
  widths.push(2)

  const totalModules = widths.reduce((sum, w) => sum + w, 0)
  const targetWidth = options.width ?? 220
  const height = options.height ?? 50
  const showText = options.showText ?? true
  const moduleWidth = targetWidth / totalModules
  const textHeight = showText ? 14 : 0

  let x = 0
  let rects = ''
  widths.forEach((w, i) => {
    const barWidth = w * moduleWidth
    // Even index = bar, odd = space.
    if (i % 2 === 0) {
      rects += `<rect x="${x.toFixed(3)}" y="0" width="${barWidth.toFixed(3)}" height="${height}" fill="#000"/>`
    }
    x += barWidth
  })

  const label = showText
    ? `<text x="${targetWidth / 2}" y="${height + 11}" font-family="monospace" font-size="10" text-anchor="middle" fill="#000">${escapeXml(value)}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${targetWidth}" height="${height + textHeight}" viewBox="0 0 ${targetWidth} ${height + textHeight}">${rects}${label}</svg>`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
