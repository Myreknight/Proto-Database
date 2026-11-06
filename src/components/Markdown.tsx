import { Fragment, type MouseEvent, type ReactNode } from 'react'

// Just enough Markdown for the tips page (site/TIPS.md): headings, paragraphs, bullet
// lists (one level of nesting), tables and rules, with **bold**, `code` and [links].

interface Item {
  text: string
  sub: string[]
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'list'; items: Item[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'rule' }

const LIST_ITEM = /^[-*]\s+/
const SUB_ITEM = /^\s{2,}[-*]\s+/
const RULE = /^-{3,}\s*$/

function parse(source: string): Block[] {
  const lines = source.split(/\r?\n/)
  const blocks: Block[] = []
  const cells = (line: string) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim())
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (!line.trim()) {
      i++
    } else if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: heading[2].trim() })
      i++
    } else if (RULE.test(line)) {
      blocks.push({ kind: 'rule' })
      i++
    } else if (line.trimStart().startsWith('|')) {
      const rows: string[][] = []
      for (; i < lines.length && lines[i].trimStart().startsWith('|'); i++) rows.push(cells(lines[i]))
      // Drops the | --- | line under the header.
      const [head = [], ...body] = rows.filter((r) => !r.every((c) => /^:?-+:?$/.test(c)))
      blocks.push({ kind: 'table', head, rows: body })
    } else if (LIST_ITEM.test(line)) {
      const items: Item[] = []
      for (; i < lines.length && (LIST_ITEM.test(lines[i]) || (items.length && SUB_ITEM.test(lines[i]))); i++) {
        if (SUB_ITEM.test(lines[i])) items[items.length - 1].sub.push(lines[i].replace(SUB_ITEM, ''))
        else items.push({ text: lines[i].replace(LIST_ITEM, ''), sub: [] })
      }
      blocks.push({ kind: 'list', items })
    } else {
      const text: string[] = []
      for (; i < lines.length && lines[i].trim() && !/^(#|\s*\||[-*]\s)/.test(lines[i]) && !RULE.test(lines[i]); i++) {
        text.push(lines[i].trim())
      }
      blocks.push({ kind: 'para', text: text.join(' ') })
    }
  }
  return blocks
}

// The id GitHub gives a heading, so "[Cables and gear](#cables-and-gear)" finds it here too.
function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
}

export function Markdown({ source, idPrefix = '' }: { source: string; idPrefix?: string }) {
  // A link to a heading scrolls to it on this page instead of changing the address.
  const jump = (e: MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault()
    document.getElementById(idPrefix + hash.slice(1))?.scrollIntoView({ block: 'start' })
  }

  const inline = (text: string): ReactNode[] =>
    text.split(/(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g).map((part, k) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={k}>{inline(part.slice(2, -2))}</strong>
      }
      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={k}>{part.slice(1, -1)}</code>
      const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
      if (link) {
        const [, label, href] = link
        return href.startsWith('#') ? (
          <a key={k} href={href} onClick={(e) => jump(e, href)}>
            {inline(label)}
          </a>
        ) : (
          <a key={k} href={href} target="_blank" rel="noreferrer">
            {inline(label)}
          </a>
        )
      }
      return <Fragment key={k}>{part}</Fragment>
    })

  return (
    <>
      {parse(source).map((b, k) => {
        switch (b.kind) {
          case 'heading': {
            const id = idPrefix + slug(b.text)
            return b.level <= 2 ? (
              <h3 key={k} id={id}>
                {inline(b.text)}
              </h3>
            ) : (
              <h4 key={k} id={id}>
                {inline(b.text)}
              </h4>
            )
          }
          case 'para':
            return <p key={k}>{inline(b.text)}</p>
          case 'list':
            return (
              <ul key={k}>
                {b.items.map((item, j) => (
                  <li key={j}>
                    {inline(item.text)}
                    {item.sub.length > 0 && (
                      <ul>
                        {item.sub.map((sub, n) => (
                          <li key={n}>{inline(sub)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )
          case 'table':
            return (
              <table key={k}>
                <thead>
                  <tr>
                    {b.head.map((c, j) => (
                      <th key={j}>{inline(c)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((c, j) => (
                        <td key={j}>{inline(c)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          case 'rule':
            return <hr key={k} />
        }
      })}
    </>
  )
}
