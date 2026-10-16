import { useEffect, useState } from 'react'

// What's playing, from the optional Now Playing helper (see helper/): Spotify or
// Apple Music, or else a media tab in a browser (YouTube, Twitch…) unless that's
// switched off. Only asked while the Winamp skin is on; nothing leaves the Mac.

export interface NowPlaying {
  app: string
  // True when it came from a browser tab rather than a music app.
  web: boolean
  title: string
  artist: string
  album: string
  // Seconds into the track when the helper answered, and the track's length (0 when
  // unknown, as for browser tabs).
  position: number
  duration: number
  // When the clock's position was taken (ms), so it can keep counting between checks.
  at: number
}

const HELPER_URL = 'http://127.0.0.1:47823/'
const POLL_MS = 5000
// Without the helper the request fails fast; check back now and then in case it's installed.
const RETRY_MS = 30000

const now = () => Date.now()

function parse(data: unknown): NowPlaying | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.playing !== true || typeof d.title !== 'string') return null
  const text = (v: unknown) => (typeof v === 'string' ? v : '')
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  return {
    app: text(d.app),
    web: d.web === true,
    title: d.title,
    artist: text(d.artist),
    album: text(d.album),
    position: num(d.position),
    duration: num(d.duration),
    at: now(),
  }
}

// Browser tabs don't report a position, so their clock counts from when the same
// tab was first seen instead of restarting at every check.
function keepClock(prev: NowPlaying | null, next: NowPlaying | null): NowPlaying | null {
  if (prev && next && next.web && prev.web && prev.app === next.app && prev.title === next.title) {
    return { ...next, at: prev.at }
  }
  return next
}

export function useNowPlaying(enabled: boolean, web: boolean): NowPlaying | null {
  const [track, setTrack] = useState<NowPlaying | null>(null)

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let timer: number | undefined

    const poll = async () => {
      let wait = POLL_MS
      // Skip checks while the window is hidden.
      if (!document.hidden) {
        try {
          const url = web ? HELPER_URL : `${HELPER_URL}?web=0`
          const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2000) })
          const next = parse(await res.json())
          if (!stopped) setTrack((prev) => keepClock(prev, next))
        } catch {
          if (!stopped) setTrack(null)
          wait = RETRY_MS
        }
      }
      if (!stopped) timer = window.setTimeout(poll, wait)
    }

    poll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [enabled, web])

  return enabled ? track : null
}
