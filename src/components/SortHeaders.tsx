import type { SortState } from '../sorting'

export interface SortColumn<K extends string> {
  key: K
  label: string
  num?: boolean
}

export function SortHeaders<K extends string>({
  columns,
  sort,
  onSort,
}: {
  columns: SortColumn<K>[]
  sort: SortState<K>
  onSort: (key: K) => void
}) {
  return (
    <tr>
      {columns.map((col) => {
        const active = sort?.key === col.key ? sort : null
        return (
          <th
            key={col.key}
            className={col.num ? 'num' : undefined}
            aria-sort={active ? (active.dir === 1 ? 'ascending' : 'descending') : undefined}
          >
            <button className={active ? 'sort active' : 'sort'} onClick={() => onSort(col.key)} title={`Sort by ${col.label}`}>
              {col.label}
              <span className="sort-mark">{active ? (active.dir === 1 ? '▲' : '▼') : ''}</span>
            </button>
          </th>
        )
      })}
    </tr>
  )
}
