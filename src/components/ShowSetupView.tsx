import { useState } from 'react'
import type { Update } from '../App'
import { imageToDataUrl, pickImageFile } from '../images'
import { ROLES, SCHEDULE, type DateId, type DateSpan, type RoleId, type Show, type ShowInfo } from '../types'

// Days in a range, counting both the first and last day. Null until both dates are set.
function dayCount({ start, end }: DateSpan): number | null {
  if (!start || !end) return null
  const day = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return Date.UTC(y, m - 1, d) / 86_400_000
  }
  return day(end) - day(start) + 1
}

function RoleField({
  label,
  add,
  names,
  onChange,
}: {
  label: string
  add: string
  names: string[]
  onChange: (names: string[]) => void
}) {
  // Always show at least one box to type into.
  const list = names.length ? names : ['']
  // The row just added with "+ Add" gets the cursor.
  const [focusRow, setFocusRow] = useState<number | null>(null)
  return (
    <div className="role">
      <span className="role-label">{label}</span>
      <div className="role-names">
        {list.map((name, i) => (
          <div key={i} className="role-row">
            <input
              autoFocus={i === focusRow}
              value={name}
              aria-label={`${label} ${i + 1}`}
              placeholder="Name"
              onChange={(e) => onChange(list.map((n, j) => (j === i ? e.target.value : n)))}
            />
            {list.length > 1 && (
              <button
                className="icon"
                aria-label={`Remove ${name || label}`}
                title="Remove"
                onClick={() => onChange(list.filter((_, j) => j !== i))}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          className="add-person"
          onClick={() => {
            setFocusRow(list.length)
            onChange([...list, ''])
          }}
        >
          + Add {add}
        </button>
      </div>
    </div>
  )
}

export function ShowSetupView({ show, update }: { show: Show; update: Update }) {
  const [logoError, setLogoError] = useState<string | null>(null)
  const { info } = show

  const patchInfo = (changes: Partial<ShowInfo>) => update((s) => ({ ...s, info: { ...s.info, ...changes } }))
  const setDate = (id: DateId, changes: Partial<DateSpan>) =>
    update((s) => ({
      ...s,
      info: { ...s.info, dates: { ...s.info.dates, [id]: { ...s.info.dates[id], ...changes } } },
    }))

  const setTeam = (role: RoleId, names: string[]) =>
    update((s) => ({ ...s, info: { ...s.info, team: { ...s.info.team, [role]: names } } }))

  const uploadLogo = async () => {
    const file = await pickImageFile()
    if (!file) return
    try {
      const logo = await imageToDataUrl(file)
      setLogoError(null)
      patchInfo({ logo })
    } catch {
      setLogoError("That image couldn't be read. Try a PNG, JPG or SVG.")
    }
  }

  return (
    <section className="pane">
      <div className="setup">
        <section className="setup-card show-card">
          <h3>Show</h3>
          <label className="field">
            <span>Show name</span>
            <input value={show.name} onChange={(e) => update((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <label className="field">
            <span>Venue</span>
            <input
              value={info.venue}
              placeholder="e.g. Imperial Theatre"
              onChange={(e) => patchInfo({ venue: e.target.value })}
            />
          </label>

          <div className="field">
            <span>Show logo</span>
            <div className="logo-box">
              {info.logo ? (
                <img src={info.logo} alt={`${show.name} logo`} />
              ) : (
                <span className="muted small">No logo yet</span>
              )}
            </div>
            <div className="logo-actions">
              <button onClick={uploadLogo}>{info.logo ? 'Replace logo…' : 'Upload logo…'}</button>
              {info.logo && (
                <button className="danger" onClick={() => patchInfo({ logo: null })}>
                  Remove
                </button>
              )}
            </div>
            {logoError && <p className="flag">{logoError}</p>}
            <small className="muted">
              Shown in the top bar and on printed lists. It's stored inside the show file, so it travels with the
              show.
            </small>
          </div>
        </section>

        <section className="setup-card schedule-card">
          <h3>Schedule</h3>
          <div className="schedule">
            {SCHEDULE.map(({ id, label, range }) => {
              const span = info.dates[id]
              const days = range ? dayCount(span) : null
              return (
                <div key={id} className="schedule-row">
                  <span className="schedule-label">{label}</span>
                  <input
                    type="date"
                    aria-label={range ? `${label} start` : label}
                    value={span.start}
                    onChange={(e) => setDate(id, { start: e.target.value })}
                  />
                  {range ? (
                    <>
                      <span className="muted">to</span>
                      <input
                        type="date"
                        aria-label={`${label} end`}
                        value={span.end}
                        min={span.start || undefined}
                        onChange={(e) => setDate(id, { end: e.target.value })}
                      />
                      <span
                        className={days != null && days < 1 ? 'warn small' : 'muted small'}
                        title={days != null && days < 1 ? 'The end date is before the start date' : undefined}
                      >
                        {days == null ? '' : days < 1 ? '⚠ check' : `${days} day${days === 1 ? '' : 's'}`}
                      </span>
                    </>
                  ) : (
                    <span className="schedule-fill" />
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="setup-card team-card">
          <h3>Audio team</h3>
          {ROLES.map((role) => (
            <RoleField
              key={role.id}
              label={role.label}
              add={role.add}
              names={info.team[role.id]}
              onChange={(names) => setTeam(role.id, names)}
            />
          ))}
          <small className="muted">The team is credited at the top of printed lists.</small>
        </section>
      </div>
    </section>
  )
}
