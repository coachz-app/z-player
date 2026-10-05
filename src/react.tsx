import { useEffect, useRef } from 'react'
import { createZPlayer, type ZPlayerHandle, type ZPlayerOptions } from './index'

export type { ZPlayerOptions, ZSource, ZTheme, ZResolution, ZTokens } from './index'

export interface ZPlayerProps extends ZPlayerOptions {
  className?: string
}

// The tokens are not part of the key: servers sign new ones on every request,
// and rebuilding the player for each refetch would cut a live every minute.
const sourceKey = (s: ZPlayerOptions['source']) => ('playbackId' in s ? `id:${s.playbackId}` : `src:${s.src}`)

/**
 * React adapter of Z Player. The player is rebuilt when the video (playback ID
 * or URL, live, autoplay) changes; signed tokens, theme, poster and callbacks
 * update in place.
 */
export function ZPlayer({ className, ...options }: ZPlayerProps) {
  const box = useRef<HTMLDivElement>(null)
  const handle = useRef<ZPlayerHandle | null>(null)
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  const key = sourceKey(options.source)
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
    })
    return () => {
      handle.current?.destroy()
      handle.current = null
    }
  }, [key, options.live, options.autoplay])

  const { theme, poster, maxResolution } = options
  useEffect(() => {
    handle.current?.update({ theme, poster, maxResolution })
  }, [theme, poster, maxResolution])

  const tokens = 'playbackId' in options.source ? options.source.tokens : undefined
  const { playback, thumbnail, storyboard } = tokens ?? {}
  useEffect(() => {
    if (playback || thumbnail || storyboard) handle.current?.update({ tokens: { playback, thumbnail, storyboard } })
  }, [playback, thumbnail, storyboard])

  return <div ref={box} className={className} style={className ? undefined : { width: '100%', aspectRatio: '16 / 9' }} />
}

export default ZPlayer
