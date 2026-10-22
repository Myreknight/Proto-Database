// A small PDF writer for drawings: lines, boxes and Helvetica text, vector all the way.
// Pages are laid out in points (72 per inch) from the top-left corner.

export type Rgb = [number, number, number]

// Helvetica and Helvetica-Bold character widths (per 1000 units of font size) for
// ASCII 32–126, from the standard font metrics, so text can be centered and trimmed.
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
  611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

// Characters past ASCII that the drawings use, as their WinAnsi codes and widths.
const SPECIAL: Record<string, { code: number; width: number }> = {
  '·': { code: 0xb7, width: 278 },
  '×': { code: 0xd7, width: 584 },
  '–': { code: 0x96, width: 556 },
  '—': { code: 0x97, width: 1000 },
  '…': { code: 0x85, width: 1000 },
  '•': { code: 0x95, width: 350 },
  '‘': { code: 0x91, width: 222 },
  '’': { code: 0x92, width: 222 },
  '“': { code: 0x93, width: 333 },
  '”': { code: 0x94, width: 333 },
  '⚠': { code: 0x21, width: 278 },
}

function charWidth(ch: string, bold: boolean): number {
  const code = ch.charCodeAt(0)
  if (code >= 32 && code <= 126) return (bold ? BOLD : REGULAR)[code - 32]
  return SPECIAL[ch]?.width ?? 556
}

// The standard fonts have no arrows, so they're spelled out.
const plain = (text: string) => text.replace(/→/g, '->').replace(/←/g, '<-')

export function textWidth(text: string, size: number, bold = false): number {
  let units = 0
  for (const ch of plain(text)) units += charWidth(ch, bold)
  return (units / 1000) * size
}

// Trims text with an ellipsis to fit a width.
export function fitText(text: string, width: number, size: number, bold = false): string {
  if (textWidth(text, size, bold) <= width) return text
  let t = text
  while (t.length > 1 && textWidth(`${t}…`, size, bold) > width) t = t.slice(0, -1)
  return t.length > 1 ? `${t.trimEnd()}…` : ''
}

// Text as a PDF string in WinAnsi, with ( ) \ escaped.
function pdfString(text: string): string {
  let out = ''
  for (const ch of plain(text)) {
    const code = ch.charCodeAt(0)
    const byte = code >= 32 && code <= 126 ? code : (SPECIAL[ch]?.code ?? 0x3f)
    const c = String.fromCharCode(byte)
    out += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c
  }
  return `(${out})`
}

const num = (v: number) => (Math.round(v * 100) / 100).toString()
const rgb = ([r, g, b]: Rgb) => `${num(r)} ${num(g)} ${num(b)}`

interface StrokeStyle {
  width?: number
  color?: Rgb
  dash?: [number, number]
}

export class PdfPage {
  readonly ops: string[] = []
  readonly width: number
  readonly height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }

  private stroke({ width = 0.5, color = [0, 0, 0], dash }: StrokeStyle) {
    this.ops.push(`${num(width)} w ${rgb(color)} RG ${dash ? `[${num(dash[0])} ${num(dash[1])}] 0 d` : '[] 0 d'}`)
  }

  line(x1: number, y1: number, x2: number, y2: number, style: StrokeStyle = {}) {
    this.stroke(style)
    this.ops.push(`${num(x1)} ${num(this.height - y1)} m ${num(x2)} ${num(this.height - y2)} l S`)
  }

  rect(x: number, y: number, w: number, h: number, style: StrokeStyle & { fill?: Rgb } = {}) {
    this.stroke(style)
    const path = `${num(x)} ${num(this.height - y - h)} ${num(w)} ${num(h)} re`
    if (style.fill) this.ops.push(`${rgb(style.fill)} rg ${path} B`)
    else this.ops.push(`${path} S`)
  }

  // y is the text's baseline, measured from the top of the page.
  text(
    x: number,
    y: number,
    text: string,
    { size = 10, bold = false, color = [0, 0, 0], anchor = 'start' }: { size?: number; bold?: boolean; color?: Rgb; anchor?: 'start' | 'middle' | 'end' } = {},
  ) {
    if (!text) return
    const w = textWidth(text, size, bold)
    const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(color)} rg ${num(left)} ${num(this.height - y)} Td ${pdfString(text)} Tj ET`)
  }
}

// The finished file: one page each, Helvetica and Helvetica-Bold from the standard 14
// fonts (nothing embedded).
export function pdfBytes(pages: PdfPage[], title = ''): Uint8Array {
  const objects: string[] = []
  const add = (body: string) => objects.push(body) // object number = index + 1
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // the page tree, filled in once the pages have numbers
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
  add(`<< /Title ${pdfString(title)} /Producer (Proto Database) >>`)
  const kids: number[] = []
  for (const page of pages) {
    const content = page.ops.join('\n')
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    const contentNo = objects.length
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNo} 0 R >>`,
    )
    kids.push(objects.length)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`

  // Every character is one byte (WinAnsi), so offsets above are byte offsets.
  const bytes = new Uint8Array(out.length)
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff
  return bytes
}
