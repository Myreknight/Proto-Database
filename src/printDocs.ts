// What the Print tab can print, in the order its list shows them.

export type PrintDoc = 'cable-list' | 'labels' | 'checklists' | 'bundle-sheets' | 'gear-list' | 'rack-drawings'

export const PRINT_DOCS: { group: string; docs: { id: PrintDoc; label: string; hint: string }[] }[] = [
  {
    group: 'Cables',
    docs: [
      { id: 'cable-list', label: 'Cable List', hint: 'Every piece, by type and length' },
      { id: 'labels', label: 'Labels', hint: 'Tails, cables and stecks' },
    ],
  },
  {
    group: 'Prep',
    docs: [
      { id: 'checklists', label: 'Checklists', hint: 'Pulled, labeled, bundled, tested' },
      { id: 'bundle-sheets', label: 'Bundle Sheets', hint: 'One page per bundle' },
    ],
  },
  {
    group: 'Gear & racks',
    docs: [
      { id: 'gear-list', label: 'Gear List', hint: 'Totaled by category and model' },
      { id: 'rack-drawings', label: 'Rack Drawings', hint: 'Elevations, parts and flow' },
    ],
  },
]

const DOC_IDS = PRINT_DOCS.flatMap((g) => g.docs.map((d) => d.id))

// The printout that goes with a tab, so ⌘P from Bundles opens Bundle Sheets.
const FOR_TAB: Record<string, PrintDoc> = {
  bundles: 'bundle-sheets',
  racks: 'rack-drawings',
  gear: 'gear-list',
  checks: 'checklists',
}

export function printDocForTab(tab: string): PrintDoc | undefined {
  return FOR_TAB[tab]
}

// The last document picked is remembered per viewer, like the other view settings.
const DOC_KEY = 'proto-database:print-doc'

export function loadPrintDoc(): PrintDoc {
  try {
    const doc = localStorage.getItem(DOC_KEY)
    return DOC_IDS.find((id) => id === doc) ?? 'cable-list'
  } catch {
    return 'cable-list'
  }
}

export function storePrintDoc(doc: PrintDoc): void {
  try {
    localStorage.setItem(DOC_KEY, doc)
  } catch {
    // Storage blocked: the choice just won't be remembered.
  }
}
