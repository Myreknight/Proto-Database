import { ROLES, type Show } from '../types'

// Top of every printed list: logo, show and venue, what the page is, and the team.
export function PrintHeader({ show, title, meta }: { show: Show; title: string; meta: string[] }) {
  const credits = ROLES.map((role) => {
    const names = show.info.team[role.id].map((n) => n.trim()).filter(Boolean)
    return names.length ? `${role.credit}: ${names.join(', ')}` : ''
  }).filter(Boolean)
  return (
    <header className="print-only print-title">
      {show.info.logo && <img className="print-logo" src={show.info.logo} alt="" />}
      <div>
        <h1>
          {show.name} · {title}
        </h1>
        <p>{[show.info.venue, ...meta].filter(Boolean).join(' · ')}</p>
        {credits.length > 0 && <p className="print-credits">{credits.join(' · ')}</p>}
      </div>
    </header>
  )
}
