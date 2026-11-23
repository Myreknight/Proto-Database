import { useState, type ReactNode } from 'react'
import { newId } from '../ids'
import type { Update } from '../App'
import { imageToDataUrl, pickImageFile } from '../images'
import { ROLES, SCHEDULE, type CustomRole, type DateId, type DateSpan, type RoleId, type Show, type ShowInfo } from '../types'

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
  heading,
  add,
  names,
  onChange,
}: {
  label: string
  // What shows in place of the label: a custom role's name field, say.
  heading?: ReactNode
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
      {heading ?? <span className="role-label">{label}</span>}
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

  // Built-in roles on and off; the show's own roles added, renamed, staffed and taken out.
  const [newRole, setNewRole] = useState<string | null>(null)
  const toggleRole = (role: RoleId, on: boolean) =>
    patchInfo({ hiddenRoles: on ? info.hiddenRoles.filter((r) => r !== role) : [...info.hiddenRoles, role] })
  const setCustom = (id: string, changes: Partial<CustomRole>) =>
    update((s) => ({
      ...s,
      info: { ...s.info, customRoles: s.info.customRoles.map((r) => (r.id === id ? { ...r, ...changes } : r)) },
    }))
  const addRole = () => {
    const id = newId()
    setNewRole(id)
    update((s) => ({ ...s, info: { ...s.info, customRoles: [...s.info.customRoles, { id, label: '', names: [] }] } }))
  }
  const removeRole = (role: CustomRole) => {
    if (role.names.some((n) => n.trim()) && !confirm(`Take out the ${role.label || 'new'} role and its names?`)) return
    update((s) => ({ ...s, info: { ...s.info, customRoles: s.info.customRoles.filter((r) => r.id !== role.id) } }))
  }

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
          <div className="role-toggles" role="group" aria-label="Roles on this show">
            {ROLES.map((role) => (
              <label key={role.id} className="check inline small">
                <input
                  type="checkbox"
                  checked={!info.hiddenRoles.includes(role.id)}
                  onChange={(e) => toggleRole(role.id, e.target.checked)}
                />
                {role.label}
              </label>
            ))}
          </div>
          {ROLES.filter((role) => !info.hiddenRoles.includes(role.id)).map((role) => (
            <RoleField
              key={role.id}
              label={role.label}
              add={role.add}
              names={info.team[role.id]}
              onChange={(names) => setTeam(role.id, names)}
            />
          ))}
          {info.customRoles.map((role) => (
            <RoleField
              key={role.id}
              label={role.label || 'New role'}
              heading={
                <div className="role-label custom-role">
                  <input
                    value={role.label}
                    autoFocus={role.id === newRole}
                    placeholder="Role, e.g. RF Tech"
                    aria-label="Role name"
                    onChange={(e) => setCustom(role.id, { label: e.target.value })}
                  />
                  <button className="icon" title="Take out this role" aria-label={`Take out ${role.label || 'this role'}`} onClick={() => removeRole(role)}>
                    ×
                  </button>
                </div>
              }
              add={role.label || 'name'}
              names={role.names}
              onChange={(names) => setCustom(role.id, { names })}
            />
          ))}
          <button className="add-person add-role" onClick={addRole}>
            + Add a role
          </button>
          <small className="muted">
            The team is credited at the top of printed lists. Untick a role the show doesn't use to leave it out; its
            names are kept.
          </small>
        </section>
      </div>
    </section>
  )
}
