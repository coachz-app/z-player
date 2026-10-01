import { useEffect, useRef } from 'react'
import { createZPlayer, type ZPlayerHandle, type ZPlayerOptions } from './index'

export type { ZPlayerOptions, ZSource, ZTheme, ZResolution } from './index'

export interface ZPlayerProps extends ZPlayerOptions {
  className?: string
}

const sourceKey = (s: ZPlayerOptions['source']) => ('playbackId' in s ? `${s.playbackId}|${s.tokens?.playback ?? ''}` : s.src)

/**
 * React adapter of Z Player. The player is rebuilt when the source (or live /
 * autoplay) changes; theme, poster and callbacks update in place.
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

  return <div ref={box} className={className} style={className ? undefined : { width: '100%', aspectRatio: '16 / 9' }} />
}

export default ZPlayer
