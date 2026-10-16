export type SortState<K extends string> = { key: K; dir: 1 | -1 } | null

export type SortValue = string | number | null

// Blanks sort last in either direction; text compares naturally ("2pr" before "12pr").
export function compareValues(a: SortValue, b: SortValue, dir: 1 | -1): number {
  const blankA = a == null || a === ''
  const blankB = b == null || b === ''
  if (blankA || blankB) return blankA === blankB ? 0 : blankA ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * dir
}

// Clicking a header: ascending, then descending, then back to the original order.
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (current?.key !== key) return { key, dir: 1 }
  if (current.dir === 1) return { key, dir: -1 }
  return null
}

// Sorts a copy; items that tie keep their original order.
export function sortItems<T, K extends string>(
  items: T[],
  sort: SortState<K>,
  value: (item: T, key: K) => SortValue,
): T[] {
  if (!sort) return items
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compareValues(value(a.item, sort.key), value(b.item, sort.key), sort.dir) || a.index - b.index)
    .map(({ item }) => item)
}

// Per-viewer table settings, kept in browser storage rather than the show.
export function loadViewSetting<T>(key: string, fallback: T): T {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (raw && typeof raw === 'object') return { ...fallback, ...raw }
  } catch {
    // Storage blocked or unreadable: use the fallback.
  }
  return fallback
}

export function storeViewSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked: the setting just won't be remembered.
  }
}
