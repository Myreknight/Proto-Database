import { sameValue, type Fields } from './patch'

// Putting two people's changes to one value together. Each started from the same value
// (`base`): what only one of them changed takes their change, and where both changed the
// same spot differently, it's a clash for someone to decide.

// Where in a value: keys of objects, places in lists.
export type Path = (string | number)[]

export interface Clash {
  path: Path
  mine: unknown
  theirs: unknown
}

const isPlain = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v)

// The two changes together. A clash keeps theirs in `value` (it's what everyone else
// already has) and says what yours was. Objects merge key by key; lists merge place by
// place only while all three are the same length, since a list that grew or shrank on
// both sides can't be lined up safely, so it clashes as a whole.
export function merge3(base: unknown, mine: unknown, theirs: unknown, path: Path = []): { value: unknown; clashes: Clash[] } {
  if (sameValue(mine, theirs) || sameValue(base, mine)) return { value: theirs, clashes: [] }
  if (sameValue(base, theirs)) return { value: mine, clashes: [] }
  if (isPlain(base) && isPlain(mine) && isPlain(theirs)) {
    const value: Fields = {}
    const clashes: Clash[] = []
    for (const key of new Set([...Object.keys(theirs), ...Object.keys(mine), ...Object.keys(base)])) {
      const m = merge3(base[key], mine[key], theirs[key], [...path, key])
      if (m.value !== undefined) value[key] = m.value
      clashes.push(...m.clashes)
    }
    return { value, clashes }
  }
  if (Array.isArray(base) && Array.isArray(mine) && Array.isArray(theirs) && base.length === mine.length && mine.length === theirs.length) {
    const clashes: Clash[] = []
    const value = theirs.map((t, i) => {
      const m = merge3(base[i], mine[i], t, [...path, i])
      clashes.push(...m.clashes)
      return m.value
    })
    return { value, clashes }
  }
  return { value: theirs, clashes: [{ path, mine, theirs }] }
}

export function getIn(value: unknown, path: Path): unknown {
  let v = value
  for (const key of path) {
    if (v === null || typeof v !== 'object') return undefined
    v = (v as Record<string | number, unknown>)[key]
  }
  return v
}

// A copy of `value` with the spot at `path` set (undefined takes an object's key off).
export function setIn(value: unknown, path: Path, next: unknown): unknown {
  if (!path.length) return next
  const [key, ...rest] = path
  if (Array.isArray(value)) {
    const out = [...value]
    out[key as number] = setIn(value[key as number], rest, next)
    return out
  }
  const obj = isPlain(value) ? { ...value } : {}
  const inner = setIn(obj[key], rest, next)
  if (inner === undefined) delete obj[key]
  else obj[key] = inner
  return obj
}
