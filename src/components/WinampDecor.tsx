import { useEffect, useState } from 'react'
import { useNowPlaying } from '../nowPlaying'
import type { Show } from '../types'

// Purely decorative pieces for the Winamp skin. Nothing here changes the show.

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

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const now = () => Date.now()

// Whether the display may show browser tabs (YouTube, Twitch…). Per viewer, on by default.
const WEB_KEY = 'proto-database:now-playing-web'

function loadWeb(): boolean {
  try {
    return localStorage.getItem(WEB_KEY) !== 'off'
  } catch {
    return true
  }
}

// Scrolls whatever's playing when the Now Playing helper is installed (Spotify or Apple
// Music first, then a browser tab unless WEB is off), and the show's own info otherwise.
export function AmpDisplay({ show }: { show: Show }) {
  const [web, setWeb] = useState(loadWeb)
  const track = useNowPlaying(true, web)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(WEB_KEY, web ? 'on' : 'off')
    } catch {
      // Storage blocked: the choice just won't be remembered.
    }
  }, [web])

  // While a track plays, the clock counts up each second between checks with the helper.
  useEffect(() => {
    if (!track) return
    const id = window.setInterval(() => setTick(now()), 1000)
    return () => window.clearInterval(id)
  }, [track])

  const cables = show.cables.length
  const bundles = show.bundles.length
  const venue = show.info.venue.trim()
  const showTitle = `1. ${show.name || 'Untitled Show'}${venue ? ` @ ${venue}` : ''} - Proto Database v${__APP_VERSION__} (${cables} cables, ${bundles} bundles)  ***  `
  const trackTitle = !track
    ? ''
    : track.web
      ? `1. ${track.title}  [${track.app}]  ***  `
      : `1. ${[track.artist, track.title].filter(Boolean).join(' - ')}${track.duration ? ` (${clock(track.duration)})` : ''}${track.album ? `  [${track.album}]` : ''}  ***  `
  const title = trackTitle || showTitle
  const elapsed = track
    ? Math.min(track.duration || Infinity, track.position + (Math.max(tick, track.at) - track.at) / 1000)
    : 0

  return (
    <div className={track ? 'amp-display playing' : 'amp-display'}>
      <div className="amp-lcd" aria-hidden="true">
        <div className="amp-time">
          <span className="amp-play">{track ? '▶' : '❚❚'}</span>
          {track ? (
            <span>{clock(elapsed)}</span>
          ) : (
            <span>
              0<span className="amp-colon">:</span>00
            </span>
          )}
        </div>
        <div className="amp-spectrum">
          {BARS.map((bar, i) => (
            <span key={i} style={{ animationDelay: `${bar.delay}ms`, animationDuration: `${bar.duration}ms` }} />
          ))}
        </div>
      </div>
      <div className="amp-info">
        <div className="amp-marquee" aria-hidden="true">
          {/* Re-keyed on the text so a new song starts scrolling from the top. */}
          <div key={title}>
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
          {track ? <span className="amp-lit">{track.app}</span> : <span className="amp-lit">stereo</span>}
          <span className="spacer" />
          <button
            className={web ? 'amp-toggle on' : 'amp-toggle'}
            aria-pressed={web}
            title={
              web
                ? 'Showing browser tabs (YouTube, Twitch…) when Spotify or Apple Music isn’t playing. Click to stop.'
                : 'Click to also show browser tabs (YouTube, Twitch…) when Spotify or Apple Music isn’t playing.'
            }
            onClick={() => setWeb((on) => !on)}
          >
            web
          </button>
        </div>
      </div>
    </div>
  )
}
