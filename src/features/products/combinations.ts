export const COMBINATION_WARN_THRESHOLD = 50
export const COMBINATION_BLOCK_THRESHOLD = 200

/** Cartesian product of each option's values, in the same order as option names. */
export function generateCombinations(optionValueLists: string[][]): string[][] {
  return optionValueLists.reduce<string[][]>(
    (acc, values) => acc.flatMap((combo) => values.map((v) => [...combo, v])),
    [[]],
  )
}

export function combinationCount(optionValueLists: string[][]): number {
  return optionValueLists.reduce((count, values) => count * (values.length || 1), 1)
}
