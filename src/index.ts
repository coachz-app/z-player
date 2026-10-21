/**
 * Z Player — a reusable video player for HLS streams, built on Mux Player
 * (https://www.mux.com/player): adaptive streaming tuned for slow networks,
 * low-latency live with DVR, seek previews, captions, AirPlay / Chromecast,
 * Mux Data analytics. Z Player adds what an application needs around it:
 * a theme, French labels, resume position, one video at a time, progress
 * callbacks, data saver and a clear end-of-live signal.
 *
 * Framework-free: `createZPlayer(container, options)`. React: `@coachz-app/z-player/react`.
 */
import '@mux/mux-player'
import 'media-chrome/lang/fr.js'
import { setLanguage } from 'media-chrome/utils/i18n.js'
import type MuxPlayerElement from '@mux/mux-player'

/** Signed playback tokens (JWT) of a private Mux playback ID: video, thumbnail, storyboard. */
export interface ZTokens {
  playback?: string
  thumbnail?: string
  storyboard?: string
}

/** A Mux playback ID (with its tokens when the playback is signed) or any HLS / MP4 URL. */
export type ZSource = { playbackId: string; tokens?: ZTokens } | { src: string }

export type ZResolution = '720p' | '1080p' | '1440p' | '2160p'

/**
 * Kind of stream. `live:dvr` is a live the viewer can rewind (back to its
 * start) and bring back to the live edge; `live` stays at the live edge.
 * Mux Player has no `live:dvr` value any more: it is `stream-type="live"` with
 * `target-live-window="Infinity"` (`live` uses a window of 0).
 */
export type ZStreamType = 'on-demand' | 'live' | 'live:dvr'

/** Where the playback is, for a page that follows it (chat replay, "back to live" button…). */
export interface ZPlaybackState {
  /**
   * Position in seconds. On-demand: from the start of the video. Live with DVR:
   * from the start of the stream (the DVR window starts with the stream).
   */
  position: number
  /** Duration of an on-demand video (NaN before it is known, Infinity for a live). */
  duration: number
  live: boolean
  /** Seconds behind the live edge (0 on-demand). */
  behindLive: number
  /** Watching the live edge (always false on-demand). */
  atLiveEdge: boolean
  paused: boolean
}

export interface ZTheme {
  /** Buttons, progress bar (default Coach Z orange). */
  accent?: string
  /** Icons and text. */
  primary?: string
  /** Control bar background. */
  secondary?: string
}

export interface ZPlayerOptions {
  source: ZSource
  poster?: string
  /** Accessible name of the player (and video title for analytics). */
  title?: string
  /**
   * Kind of stream (default `on-demand`). Takes precedence over `live` / `dvr`.
   */
  streamType?: ZStreamType
  /** Live stream (same as `streamType: 'live:dvr'`, or `'live'` with `dvr: false`). */
  live?: boolean
  dvr?: boolean
  /** Start playing at once (falls back to muted if the browser refuses sound). */
  autoplay?: boolean
  /** Resume position in seconds (on-demand only). */
  startTime?: number
  /** Data saver: never load above this resolution. */
  maxResolution?: ZResolution
  theme?: ZTheme
  /**
   * Chromecast (default true). On Chrome, the Cast module is loaded from
   * Google's servers when a video shows; false loads nothing from Google and
   * hides the button, for the whole page (it cannot be turned back on once a
   * player has loaded the module). AirPlay is not affected.
   */
  cast?: boolean
  /** Interface language (default "fr"). */
  lang?: string
  /**
   * Mux Data: environment key (public) and what to attach to each view. No
   * cookie unless `cookies` is true; nothing is measured when the browser asks
   * not to be tracked (Do Not Track) or with `analytics: false`.
   */
  analytics?: false | { envKey?: string; videoId?: string; viewerId?: string; playerName?: string; cookies?: boolean }
  /** Seconds between two onProgress calls while playing (default 10). */
  progressInterval?: number
  onProgress?: (position: number, duration: number) => void
  onEnded?: () => void
  /** A live stream is over (or gone): the page can switch to the replay. */
  onLiveEnded?: () => void
  onError?: (message: string) => void
  /**
   * The playback moved (while playing, about 4 times a second, and after a
   * seek). Cheap to receive: a page can sync a chat replay on `position`.
   */
  onTimeUpdate?: (state: ZPlaybackState) => void
  /** A live viewer left the live edge (rewind, long pause) or came back to it. */
  onLiveEdgeChange?: (atLiveEdge: boolean) => void
}

export interface ZPlayerHandle {
  element: MuxPlayerElement
  /**
   * Updates the options that do not change the source (theme, callbacks…) and,
   * with `tokens`, refreshes the signed tokens of the same playback ID without
   * rebuilding the player (see `refreshTokens` for when a token is replaced).
   * `title` and the `analytics` identifiers (`videoId`, `viewerId`,
   * `playerName`) update the Mux Data view in place, e.g. when the viewer is
   * known only after the player was created; `envKey`, `cookies` and turning
   * analytics on or off only apply to a new player.
   */
  update(options: Partial<Omit<ZPlayerOptions, 'source'>> & { tokens?: ZTokens }): void
  /** Current playback state (position, distance to the live edge…). */
  getState(): ZPlaybackState
  /** Back to the live edge of a live, and play ("Revenir au direct"). */
  goLive(): void
  /** Moves to a position in seconds (clamped to what can be reached). */
  seek(position: number): void
  destroy(): void
}

/** Seconds behind the live edge under which a viewer still watches "the live". */
export const LIVE_EDGE_TOLERANCE_S = 10

/** Whether the options describe a live stream, and one that can be rewound. */
export function resolveStreamType(o: Pick<ZPlayerOptions, 'streamType' | 'live' | 'dvr'>): ZStreamType {
  if (o.streamType) return o.streamType
  if (o.live) return o.dvr === false ? 'live' : 'live:dvr'
  return 'on-demand'
}

const DEFAULT_THEME: Required<ZTheme> = { accent: '#FFA500', primary: '#FFFFFF', secondary: '#000000' }

// Only one video plays at a time across every Z Player of the page.
const players = new Set<MuxPlayerElement>()

/**
 * Mux Player loads Google's Cast sender unless `chrome.cast` already exists:
 * declaring Cast unavailable keeps it from loading and hides the cast button.
 */
function disableCast() {
  const c = (globalThis as { chrome?: { cast?: unknown } }).chrome
  if (c && !c.cast) c.cast = { isAvailable: false }
}

/**
 * A token is replaced only when the current one is missing, expired or expires
 * within this margin. Servers usually sign a new token on every request (each
 * refetch of the page data), and replacing the playback token makes Mux Player
 * reload the stream: keeping a still valid token avoids a reload every refetch.
 */
export const TOKEN_REFRESH_MARGIN_S = 5 * 60

/** Expiry (seconds since epoch) of a JWT, or undefined when it cannot be read. */
export function tokenExpiry(token: string): number | undefined {
  try {
    const part = token.split('.')[1]
    if (!part) return undefined
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='))
    const exp = (JSON.parse(json) as { exp?: unknown }).exp
    return typeof exp === 'number' ? exp : undefined
  } catch {
    return undefined
  }
}

/**
 * The token to keep between the current one and a freshly signed one: the
 * current token while it stays valid beyond the margin, the fresh one otherwise
 * (a token whose expiry cannot be read is treated as expiring).
 */
export function pickToken(current: string | undefined, next: string | undefined, now = Date.now() / 1000): string | undefined {
  if (!next || next === current) return current
  if (!current) return next
  const exp = tokenExpiry(current)
  return exp !== undefined && exp - now > TOKEN_REFRESH_MARGIN_S ? current : next
}

const TOKEN_ATTRIBUTES = { playback: 'playback-token', thumbnail: 'thumbnail-token', storyboard: 'storyboard-token' } as const

function applySource(el: MuxPlayerElement, source: ZSource) {
  if ('playbackId' in source) {
    el.playbackId = source.playbackId
    if (source.tokens) el.tokens = source.tokens
  } else {
    el.src = source.src
  }
}

/** Creates a player inside `container` (which it fills). */
export function createZPlayer(container: HTMLElement, options: ZPlayerOptions): ZPlayerHandle {
  const streamType = resolveStreamType(options)
  const isLive = streamType !== 'on-demand'
  let opts = { ...options, live: isLive }
  setLanguage(opts.lang ?? 'fr')
  if (opts.cast === false) disableCast()
  const el = document.createElement('mux-player') as MuxPlayerElement
  const theme = { ...DEFAULT_THEME, ...opts.theme }
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.setProperty('--media-object-fit', 'contain')
  el.accentColor = theme.accent
  el.primaryColor = theme.primary
  el.secondaryColor = theme.secondary
  if (opts.title) el.setAttribute('aria-label', opts.title)
  if (opts.poster) el.poster = opts.poster

  // Streaming: nothing is downloaded before play (unless autoplay), the first
  // segments come in a modest quality, never above the player size or the data
  // saver limit, and CMCD lets the CDN serve each viewer better.
  el.setAttribute('preload', opts.autoplay ? 'auto' : 'none')
  el.capRenditionToPlayerSize = true
  if (opts.maxResolution) el.maxResolution = opts.maxResolution
  el.preferCmcd = 'query'
  el.defaultHiddenCaptions = true
  el.playbackRates = [0.75, 1, 1.25, 1.5, 2]
  if (isLive) {
    el.streamType = 'live'
    el.targetLiveWindow = streamType === 'live:dvr' ? Number.POSITIVE_INFINITY : 0
  } else {
    el.streamType = 'on-demand'
    if (opts.startTime && opts.startTime > 5) el.startTime = opts.startTime
  }
  // "any": with sound when allowed, muted otherwise (mobile browsers).
  if (opts.autoplay) el.setAttribute('autoplay', 'any')

  const a = opts.analytics || undefined
  el.disableTracking = opts.analytics === false || navigator.doNotTrack === '1'
  el.disableCookies = !a?.cookies
  if (a?.envKey) el.envKey = a.envKey
  let metadata: Record<string, string | undefined> = {
    video_id: a?.videoId,
    video_title: opts.title,
    viewer_user_id: a?.viewerId,
    player_name: a?.playerName ?? 'Z Player',
  }
  el.metadata = metadata
  // Mux Player sends new metadata to Mux Data at once (same view): a viewer
  // known only after mount is attached to the view that is already running.
  const updateMetadata = (next: Partial<ZPlayerOptions>) => {
    const changes: Record<string, string | undefined> = {}
    if (next.title !== undefined) changes.video_title = next.title
    const an = next.analytics
    if (an) {
      if (an.videoId !== undefined) changes.video_id = an.videoId
      if (an.viewerId !== undefined) changes.viewer_user_id = an.viewerId
      if (an.playerName !== undefined) changes.player_name = an.playerName
    }
    if (Object.entries(changes).every(([k, v]) => metadata[k] === v)) return
    metadata = { ...metadata, ...changes }
    el.metadata = metadata
  }

  applySource(el, opts.source)
  container.appendChild(el)
  players.add(el)

  // Progress: every few seconds while playing, at pause, at the end, when the
  // page is hidden or closed (tab switch, PWA sent to the background, tab
  // closed: the interval would lose up to its period) and when leaving.
  let timer: ReturnType<typeof setInterval> | undefined
  const report = () => {
    if (opts.live) return
    const d = el.duration
    if (Number.isFinite(d) && d > 0 && el.currentTime > 0) opts.onProgress?.(el.currentTime, d)
  }
  const onPlay = () => {
    for (const p of players) if (p !== el && !p.paused) p.pause()
    clearInterval(timer)
    timer = setInterval(report, (opts.progressInterval ?? 10) * 1000)
  }
  const onPause = () => {
    clearInterval(timer)
    report()
  }
  const onEnded = () => {
    clearInterval(timer)
    if (opts.live) opts.onLiveEnded?.()
    else {
      const d = el.duration
      if (Number.isFinite(d)) opts.onProgress?.(d, d)
      opts.onEnded?.()
    }
  }
  const onError = (ev: Event) => {
    // Mux Player already retries; a live that keeps failing is over.
    if (opts.live) opts.onLiveEnded?.()
    const message = (ev as CustomEvent<{ message?: string } | undefined>).detail?.message
    opts.onError?.(message || 'La vidéo est momentanément indisponible.')
  }
  // `pagehide` is the last reliable event when a page is closed (mobile
  // browsers may skip it: `visibilitychange` to hidden comes first). The
  // consumer should send the position with `fetch(..., { keepalive: true })`
  // so that the request survives the page.
  const onPageHide = () => report()
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') report()
  }

  // Playback state, for a page that follows the position (chat replay) or
  // shows its own "back to live" button.
  const liveEnd = () => {
    const s = el.seekable
    return s && s.length > 0 ? s.end(s.length - 1) : NaN
  }
  const getState = (): ZPlaybackState => {
    const position = el.currentTime || 0
    if (!isLive) return { position, duration: el.duration, live: false, behindLive: 0, atLiveEdge: false, paused: el.paused }
    const end = liveEnd()
    const behindLive = Number.isFinite(end) ? Math.max(0, end - position) : 0
    return { position, duration: Number.POSITIVE_INFINITY, live: true, behindLive, atLiveEdge: behindLive <= LIVE_EDGE_TOLERANCE_S, paused: el.paused }
  }
  let atEdge: boolean | undefined
  const onTimeUpdate = () => {
    const state = getState()
    opts.onTimeUpdate?.(state)
    if (isLive && state.atLiveEdge !== atEdge) {
      // The first state is the reference: only changes are reported.
      if (atEdge !== undefined) opts.onLiveEdgeChange?.(state.atLiveEdge)
      atEdge = state.atLiveEdge
    }
  }
  const goLive = () => {
    if (!isLive) return
    const end = liveEnd()
    if (Number.isFinite(end)) el.currentTime = end
    if (el.paused) void el.play()?.catch(() => {})
  }
  const seek = (position: number) => {
    const s = el.seekable
    let p = Math.max(0, position)
    if (s && s.length > 0) p = Math.min(Math.max(p, s.start(0)), s.end(s.length - 1))
    else if (Number.isFinite(el.duration)) p = Math.min(p, el.duration)
    el.currentTime = p
  }

  el.addEventListener('play', onPlay)
  el.addEventListener('pause', onPause)
  el.addEventListener('ended', onEnded)
  el.addEventListener('error', onError)
  el.addEventListener('timeupdate', onTimeUpdate)
  el.addEventListener('seeked', onTimeUpdate)
  window.addEventListener('pagehide', onPageHide)
  document.addEventListener('visibilitychange', onVisibilityChange)

  /**
   * Refreshes the tokens of the same playback ID in place, never rebuilding the
   * player (that would cut a live, lose the DVR position or restart a video at
   * its initial start time).
   *
   * Mux checks the token when the stream is loaded, and a new playback token
   * means a new stream URL: Mux Player (mux-video) then reloads the source. So a
   * token is only replaced when it expires soon (`pickToken`): with tokens valid
   * for hours, that is at most one reload per validity period instead of one per
   * refetch. When the playback token must change after playback has started,
   * the position (on-demand, or behind the live edge) and the playing state are
   * restored once the new stream is loaded. Thumbnail and storyboard tokens do
   * not touch the stream.
   *
   * Tokens are set through their attributes: the `tokens` property of Mux
   * Player only stores the value and does not re-render the player.
   */
  const refreshTokens = (fresh: ZTokens) => {
    const source = opts.source
    if (!('playbackId' in source)) return
    const current = el.tokens ?? {}
    const kept: ZTokens = {
      playback: pickToken(current.playback, fresh.playback),
      thumbnail: pickToken(current.thumbnail, fresh.thumbnail),
      storyboard: pickToken(current.storyboard, fresh.storyboard),
    }
    const changed = (Object.keys(TOKEN_ATTRIBUTES) as (keyof ZTokens)[]).filter((k) => kept[k] && kept[k] !== current[k])
    if (changed.length === 0) return
    opts = { ...opts, source: { ...source, tokens: { ...source.tokens, ...kept } } }

    if (changed.includes('playback')) {
      const started = el.readyState > 0 || !el.paused || el.currentTime > 0
      if (started) {
        const wasPlaying = !el.paused
        const position = el.currentTime
        const s = el.seekable
        const behindLive = opts.live && s && s.length > 0 && s.end(s.length - 1) - position > 30
        el.addEventListener(
          'loadedmetadata',
          () => {
            if (!opts.live || behindLive) el.currentTime = position
            if (wasPlaying) void el.play()?.catch(() => {})
          },
          { once: true },
        )
      }
    }
    el.tokens = { ...current, ...kept }
    for (const k of changed) el.setAttribute(TOKEN_ATTRIBUTES[k], kept[k] as string)
  }

  return {
    element: el,
    update({ tokens, ...next }) {
      // The kind of stream only changes with a new player.
      opts = { ...opts, ...next, live: isLive }
      if (tokens) refreshTokens(tokens)
      if (next.title !== undefined) {
        if (next.title) el.setAttribute('aria-label', next.title)
        else el.removeAttribute('aria-label')
      }
      if (opts.analytics !== false) updateMetadata(next)
      if (next.theme) {
        const t = { ...DEFAULT_THEME, ...next.theme }
        el.accentColor = t.accent
        el.primaryColor = t.primary
        el.secondaryColor = t.secondary
      }
      if (next.poster !== undefined) el.poster = next.poster
      if (next.maxResolution !== undefined) el.maxResolution = next.maxResolution
    },
    getState,
    goLive,
    seek,
    destroy() {
      clearInterval(timer)
      report()
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onError)
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('seeked', onTimeUpdate)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      players.delete(el)
      // A player removed while it is still starting (autoplay, React remounts,
      // navigation to the next video) must never play on, unseen and unreachable:
      // no more autoplay, no sound, no source, and any late play is undone.
      el.removeAttribute('autoplay')
      el.muted = true
      el.addEventListener('play', () => el.pause())
      el.pause()
      el.remove()
      el.removeAttribute('playback-id')
      el.removeAttribute('src')
      el.playbackId = undefined
      el.src = undefined
    },
  }
}
