// Port lists are typed as ranges: "In A-D, Out 1-4, Net Pri, Net Sec" or "1-48".

// Guards against a typo like "1-99999" expanding forever.
const MAX_RANGE = 512

// How ports compare: case and spaces don't matter, so "in a", "In A" and "InA" match.
export function portKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '')
}

// "In A-D, Out 1-4, Net Pri" → In A, In B, In C, In D, Out 1, Out 2, Out 3, Out 4, Net Pri.
// Number ranges keep leading zeros ("01-16"); letter ranges need a space before them
// ("In A-D"), so a name like "Net-A" stays one port. A name in quotes stays as written,
// for a connector that carries a range ("In 1-8" on a DB25).
export function expandPorts(spec: string): string[] {
  const ports: string[] = []
  const seen = new Set<string>()
  const add = (name: string) => {
    const key = portKey(name)
    if (!key || seen.has(key)) return
    seen.add(key)
    ports.push(name)
  }
  for (const raw of spec.split(/[,;\n]+/)) {
    const token = raw.trim().replace(/\s+/g, ' ')
    if (!token) continue
    const quoted = token.match(/^["“'](.+)["”']$/)
    if (quoted) {
      add(quoted[1].trim())
      continue
    }
    const digits = token.match(/^(.*?)(\d+)\s*[-–]\s*(\d+)$/)
    if (digits) {
      const [, prefix, a, b] = digits
      const start = Number(a)
      const end = Number(b)
      if (end > start && end - start < MAX_RANGE) {
        const width = a.length > 1 && a.startsWith('0') ? a.length : 0
        for (let n = start; n <= end; n++) add(`${prefix}${String(n).padStart(width, '0')}`)
        continue
      }
    }
    const letters = token.match(/^(.*\s)?([A-Za-z])\s*[-–]\s*([A-Za-z])$/)
    if (letters) {
      const [, prefix = '', a, b] = letters
      const start = a.charCodeAt(0)
      const end = b.charCodeAt(0)
      const sameCase = (a === a.toUpperCase()) === (b === b.toUpperCase())
      if (end > start && end - start < 26 && sameCase) {
        for (let c = start; c <= end; c++) add(`${prefix}${String.fromCharCode(c)}`)
        continue
      }
    }
    add(token)
  }
  return ports
}

export type PortMatch =
  | { port: string; byLastWord: boolean }
  | { port: null; candidates: string[] }

// Which listed port some typed text names. An exact match wins; otherwise the last word
// can stand in when only one port ends with it, so "A" finds In A.
export function findPort(ports: string[], text: string): PortMatch {
  const key = portKey(text)
  const exact = ports.find((p) => portKey(p) === key)
  if (exact) return { port: exact, byLastWord: false }
  const byLast = ports.filter((p) => {
    const words = p.split(' ')
    return words.length > 1 && portKey(words[words.length - 1]) === key
  })
  if (byLast.length === 1) return { port: byLast[0], byLastWord: true }
  return { port: null, candidates: byLast }
}

const leadingWords = (port: string) => port.split(' ').slice(0, -1).join(' ')

// The ports after a matched one, for filling down. Matched by its last word ("Amp 1-A"),
// the run continues by last word through the ports that share its first words (B, C, D
// of In A-D) and stops where they change.
export function portsAfter(ports: string[], match: { port: string; byLastWord: boolean }): string[] {
  const after = ports.slice(ports.indexOf(match.port) + 1)
  if (!match.byLastWord) return after
  const lead = leadingWords(match.port)
  const run: string[] = []
  for (const p of after) {
    if (leadingWords(p) !== lead) break
    run.push(p.split(' ').pop() ?? p)
  }
  return run
}

// "Ch 1" → Ch 2, Ch 3…; "Amp 1-A" → Amp 1-B, Amp 1-C…; anything else repeats.
export function textSeries(text: string, count: number): string[] {
  const values = [text]
  const number = text.match(/^(.*?)(\d+)(\s*)$/)
  const letter = text.match(/^(.*[^A-Za-z])([A-Za-z])(\s*)$/)
  for (let i = 1; i < count; i++) {
    if (number) {
      const [, prefix, digits, trail] = number
      const width = digits.startsWith('0') ? digits.length : 0
      values.push(`${prefix}${String(Number(digits) + i).padStart(width, '0')}${trail}`)
    } else if (letter && letter[2].toUpperCase().charCodeAt(0) + i <= 90) {
      const [, prefix, ch, trail] = letter
      values.push(`${prefix}${String.fromCharCode(ch.charCodeAt(0) + i)}${trail}`)
    } else {
      values.push(text)
    }
  }
  return values
}

// What comes after some cells when they're dragged further, like a spreadsheet's fill
// handle. One cell continues its own series (`single`, e.g. counting up or stepping
// through a device's ports). Several that count by a steady step ("In 1", "In 3") keep
// that step; anything else repeats.
export function continueSeries(seeds: string[], count: number, single: (text: string, count: number) => string[]): string[] {
  if (count < 1 || seeds.length === 0) return []
  if (seeds.length === 1) return single(seeds[0], count + 1).slice(1)
  const parts = seeds.map((s) => s.match(/^(.*?)(\d+)(\D*)$/))
  const same = parts.every((p) => p && p[1] === parts[0]![1] && p[3] === parts[0]![3])
  if (same) {
    const nums = parts.map((p) => Number(p![2]))
    const step = nums[1] - nums[0]
    if (step !== 0 && nums.every((n, i) => i === 0 || n - nums[i - 1] === step)) {
      const [, prefix, digits, suffix] = parts[0]!
      const width = digits.startsWith('0') ? digits.length : 0
      const last = nums[nums.length - 1]
      return Array.from({ length: count }, (_, k) => {
        const n = last + step * (k + 1)
        return n < 0 ? '' : `${prefix}${String(n).padStart(width, '0')}${suffix}`
      })
    }
  }
  return Array.from({ length: count }, (_, k) => seeds[k % seeds.length])
}
