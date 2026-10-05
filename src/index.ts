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
  /** Live stream. With `dvr` (default true) viewers can go back to the start. */
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
}

export interface ZPlayerHandle {
  element: MuxPlayerElement
  /**
   * Updates the options that do not change the source (theme, callbacks…) and,
   * with `tokens`, refreshes the signed tokens of the same playback ID without
   * rebuilding the player (see `refreshTokens` for when a token is replaced).
   */
  update(options: Partial<Omit<ZPlayerOptions, 'source'>> & { tokens?: ZTokens }): void
  destroy(): void
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
  let opts = options
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
  if (opts.live) {
    el.streamType = 'live'
    el.targetLiveWindow = opts.dvr === false ? 0 : Number.POSITIVE_INFINITY
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
  el.metadata = {
    video_id: a?.videoId,
    video_title: opts.title,
    viewer_user_id: a?.viewerId,
    player_name: a?.playerName ?? 'Z Player',
  }

  applySource(el, opts.source)
  container.appendChild(el)
  players.add(el)

  // Progress: every few seconds while playing, at pause and when leaving.
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
  el.addEventListener('play', onPlay)
  el.addEventListener('pause', onPause)
  el.addEventListener('ended', onEnded)
  el.addEventListener('error', onError)

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
      opts = { ...opts, ...next }
      if (tokens) refreshTokens(tokens)
      if (next.theme) {
        const t = { ...DEFAULT_THEME, ...next.theme }
        el.accentColor = t.accent
        el.primaryColor = t.primary
        el.secondaryColor = t.secondary
      }
      if (next.poster !== undefined) el.poster = next.poster
      if (next.maxResolution !== undefined) el.maxResolution = next.maxResolution
    },
    destroy() {
      clearInterval(timer)
      report()
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
      el.removeEventListener('error', onError)
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
