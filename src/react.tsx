import { useEffect, useRef, type RefObject } from 'react'
import { createZPlayer, resolveStreamType, type ZPlayerHandle, type ZPlayerOptions } from './index'

export type { ZPlayerOptions, ZPlayerHandle, ZPlaybackState, ZSource, ZStreamType, ZTheme, ZResolution, ZTokens } from './index'

export interface ZPlayerProps extends ZPlayerOptions {
  className?: string
  /**
   * Receives the player handle (`getState`, `goLive`, `seek`…) while it is
   * mounted, null otherwise.
   */
  handleRef?: RefObject<ZPlayerHandle | null>
}

// The tokens are not part of the key: servers sign new ones on every request,
// and rebuilding the player for each refetch would cut a live every minute.
const sourceKey = (s: ZPlayerOptions['source']) => ('playbackId' in s ? `id:${s.playbackId}` : `src:${s.src}`)

/**
 * React adapter of Z Player. The player is rebuilt when the video (playback ID
 * or URL, kind of stream, autoplay) changes; signed tokens, theme, poster, title, Mux
 * Data identifiers (`analytics.viewerId`…) and callbacks update in place.
 */
export function ZPlayer({ className, handleRef, ...options }: ZPlayerProps) {
  const box = useRef<HTMLDivElement>(null)
  const handle = useRef<ZPlayerHandle | null>(null)
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  const key = sourceKey(options.source)
  const streamType = resolveStreamType(options)
  useEffect(() => {
    if (!box.current) return
    const o = latest.current
    // Callbacks always read the latest props.
    handle.current = createZPlayer(box.current, {
      ...o,
      onProgress: (p, d) => latest.current.onProgress?.(p, d),
      onEnded: () => latest.current.onEnded?.(),
      onLiveEnded: () => latest.current.onLiveEnded?.(),
      onError: (m) => latest.current.onError?.(m),
      onTimeUpdate: (st) => latest.current.onTimeUpdate?.(st),
      onLiveEdgeChange: (at) => latest.current.onLiveEdgeChange?.(at),
    })
    if (handleRef) handleRef.current = handle.current
    return () => {
      handle.current?.destroy()
      handle.current = null
      if (handleRef) handleRef.current = null
    }
  }, [key, streamType, options.autoplay, handleRef])

  const { theme, poster, maxResolution } = options
  useEffect(() => {
    handle.current?.update({ theme, poster, maxResolution })
  }, [theme, poster, maxResolution])

  // Mux Data: the viewer (often known only once the user profile is loaded)
  // and the title update the running view, without rebuilding the player.
  const { title } = options
  const off = options.analytics === false
  const analytics = options.analytics || undefined
  const videoId = analytics?.videoId
  const viewerId = analytics?.viewerId
  const playerName = analytics?.playerName
  useEffect(() => {
    handle.current?.update({ title, analytics: off ? false : { videoId, viewerId, playerName } })
  }, [title, off, videoId, viewerId, playerName])

  const tokens = 'playbackId' in options.source ? options.source.tokens : undefined
  const { playback, thumbnail, storyboard } = tokens ?? {}
  useEffect(() => {
    if (playback || thumbnail || storyboard) handle.current?.update({ tokens: { playback, thumbnail, storyboard } })
  }, [playback, thumbnail, storyboard])

  return <div ref={box} className={className} style={className ? undefined : { width: '100%', aspectRatio: '16 / 9' }} />
}

export default ZPlayer
