import { PARTS, type CableType, type Part } from './types'
import { newId } from './ids'

export const CABLE_TYPE_HEADERS = [
  'Name',
  'Part',
  'Channels',
  'End A',
  'End B',
  'Standard Lengths (ft)',
  'Notes',
]

// RFC 4180-style parser: quoted fields, doubled quotes, CRLF or LF.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeField).join(',')).join('\n') + '\n'
}

function parsePart(value: string): Part {
  const match = PARTS.find((p) => p.toLowerCase() === value.trim().toLowerCase())
  return match ?? 'Cable'
}

export function parseLengths(value: string): number[] {
  return value
    .split(/[;,/]/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

// Columns are matched by header name so reordering them in a spreadsheet is fine.
export function cableTypesFromCsv(text: string): { types: CableType[]; warnings: string[] } {
  const rows = parseCsv(text)
  const warnings: string[] = []
  if (rows.length === 0) return { types: [], warnings: ['The file is empty.'] }

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name.toLowerCase())
  const idx = {
    name: col('Name'),
    part: col('Part'),
    channels: col('Channels'),
    endA: col('End A'),
    endB: col('End B'),
    lengths: col('Standard Lengths (ft)'),
    notes: col('Notes'),
  }
  if (idx.name < 0) return { types: [], warnings: ['No "Name" column found.'] }

  const seen = new Set<string>()
  const types: CableType[] = []
  rows.slice(1).forEach((r, i) => {
    const get = (j: number) => (j >= 0 ? (r[j] ?? '').trim() : '')
    const name = get(idx.name)
    if (!name) {
      warnings.push(`Row ${i + 2}: no name, skipped.`)
      return
    }
    if (seen.has(name.toLowerCase())) {
      warnings.push(`Row ${i + 2}: duplicate name "${name}", skipped.`)
      return
    }
    seen.add(name.toLowerCase())
    const channels = Math.max(1, Math.floor(Number(get(idx.channels)) || 1))
    types.push({
      id: newId(),
      name,
      part: parsePart(get(idx.part)),
      channels,
      endA: get(idx.endA),
      endB: get(idx.endB),
      lengths: parseLengths(get(idx.lengths)),
      notes: get(idx.notes),
    })
  })
  return { types, warnings }
}

export function cableTypesToCsv(types: CableType[]): string {
  return toCsv([
    CABLE_TYPE_HEADERS,
    ...types.map((t) => [
      t.name,
      t.part,
      String(t.channels),
      t.endA,
      t.endB,
      t.lengths.join(';'),
      t.notes,
    ]),
  ])
}
