import type { Show } from '../types'

// Purely decorative pieces for the Winamp skin. Nothing here does anything.

export function AmpTitleBar() {
  return (
    <div className="amp-titlebar" aria-hidden="true">
      <span className="amp-stripes" />
      <span className="amp-title">PROTO DATABASE</span>
      <span className="amp-stripes" />
      <span className="amp-winbtns">
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}

// 19 bars, one per pair on a 19pr. Delays and speeds are fixed so the dance looks random.
const BARS = Array.from({ length: 19 }, (_, i) => ({
  delay: -((i * 137) % 900),
  duration: 600 + ((i * 211) % 600),
}))

export function AmpDisplay({ show }: { show: Show }) {
  const cables = show.cables.length
  const bundles = show.bundles.length
  const title = `1. ${show.name || 'Untitled Show'} - Proto Database v${__APP_VERSION__} (${cables} cables, ${bundles} bundles)  ***  `
  return (
    <div className="amp-display" aria-hidden="true">
      <div className="amp-lcd">
        <div className="amp-time">
          <span className="amp-play">▶</span>
          <span>
            0<span className="amp-colon">:</span>00
          </span>
        </div>
        <div className="amp-spectrum">
          {BARS.map((bar, i) => (
            <span key={i} style={{ animationDelay: `${bar.delay}ms`, animationDuration: `${bar.duration}ms` }} />
          ))}
        </div>
      </div>
      <div className="amp-info">
        <div className="amp-marquee">
          <div>
            <span>{title}</span>
            <span>{title}</span>
          </div>
        </div>
        <div className="amp-stats">
          <span>
            <b>{String(cables).padStart(3, ' ')}</b> kbps
          </span>
          <span>
            <b>{String(bundles).padStart(2, ' ')}</b> kHz
          </span>
          <span className="amp-lit">stereo</span>
        </div>
      </div>
    </div>
  )
}
