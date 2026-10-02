import { beforeAll, describe, expect, it, vi } from 'vitest'

// Mux Player needs a real browser (Media Source): a light stand-in element is
// enough to test what Z Player adds around it.
vi.mock('@mux/mux-player', () => ({}))
vi.mock('media-chrome/lang/fr.js', () => ({}))
const setLanguage = vi.fn()
vi.mock('media-chrome/utils/i18n.js', () => ({ setLanguage: (l: string) => setLanguage(l) }))

class FakeMuxPlayer extends HTMLElement {
  paused = true
  currentTime = 0
  duration = NaN
  pause() {
    if (this.paused) return
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }
  play() {
    this.paused = false
    this.dispatchEvent(new Event('play'))
  }
}

beforeAll(() => customElements.define('mux-player', FakeMuxPlayer))

const { createZPlayer } = await import('../src/index')

type Fake = FakeMuxPlayer & Record<string, unknown>

describe('createZPlayer', () => {
  it('configures the player for streaming, theme and analytics', () => {
    const box = document.createElement('div')
    const h = createZPlayer(box, {
      source: { playbackId: 'pb1', tokens: { playback: 'tp', thumbnail: 'tt', storyboard: 'ts' } },
      title: 'Capsule',
      maxResolution: '720p',
      startTime: 42,
      analytics: { envKey: 'env', videoId: 'content:1', viewerId: '7' },
    })
    const el = h.element as unknown as Fake
    expect(box.contains(el)).toBe(true)
    expect(setLanguage).toHaveBeenCalledWith('fr')
    expect(el.playbackId).toBe('pb1')
    expect(el.tokens).toEqual({ playback: 'tp', thumbnail: 'tt', storyboard: 'ts' })
    expect(el.getAttribute('preload')).toBe('none') // nothing downloaded before play
    expect(el.maxResolution).toBe('720p')
    expect(el.capRenditionToPlayerSize).toBe(true)
    expect(el.startTime).toBe(42)
    expect(el.streamType).toBe('on-demand')
    expect(el.accentColor).toBe('#FFA500')
    expect(el.envKey).toBe('env')
    expect(el.metadata).toMatchObject({ video_id: 'content:1', video_title: 'Capsule', viewer_user_id: '7', player_name: 'Z Player' })
    expect(el.disableCookies).toBe(true) // no cookie unless asked
    expect(el.disableTracking).toBe(false)
    h.destroy()
    expect(box.contains(el)).toBe(false)
  })

  it('plays a plain URL, live with DVR, autoplay with fallback to muted', () => {
    const h = createZPlayer(document.createElement('div'), { source: { src: 'https://x.test/a.m3u8' }, live: true, autoplay: true })
    const el = h.element as unknown as Fake
    expect(el.src).toBe('https://x.test/a.m3u8')
    expect(el.streamType).toBe('live')
    expect(el.targetLiveWindow).toBe(Number.POSITIVE_INFINITY)
    expect(el.getAttribute('autoplay')).toBe('any')
    expect(el.getAttribute('preload')).toBe('auto')
    h.destroy()
    const off = createZPlayer(document.createElement('div'), { source: { src: 'b' }, analytics: false })
    expect((off.element as unknown as Fake).disableTracking).toBe(true)
    off.destroy()
  })

  it('plays one video at a time', () => {
    const a = createZPlayer(document.createElement('div'), { source: { src: 'a' } })
    const b = createZPlayer(document.createElement('div'), { source: { src: 'b' } })
    const ea = a.element as unknown as FakeMuxPlayer
    const eb = b.element as unknown as FakeMuxPlayer
    ea.play()
    eb.play()
    expect(ea.paused).toBe(true)
    expect(eb.paused).toBe(false)
    a.destroy()
    b.destroy()
  })

  it('reports progress at pause, at the end and when leaving', () => {
    const onProgress = vi.fn()
    const onEnded = vi.fn()
    const h = createZPlayer(document.createElement('div'), { source: { src: 'a' }, onProgress, onEnded })
    const el = h.element as unknown as FakeMuxPlayer
    el.duration = 600
    el.play()
    el.currentTime = 120
    el.pause()
    expect(onProgress).toHaveBeenLastCalledWith(120, 600)
    el.dispatchEvent(new Event('ended'))
    expect(onProgress).toHaveBeenLastCalledWith(600, 600)
    expect(onEnded).toHaveBeenCalled()
    el.currentTime = 300
    h.destroy()
    expect(onProgress).toHaveBeenLastCalledWith(300, 600)
  })

  it('signals the end of a live (ended or failing stream) instead of an error', () => {
    const onLiveEnded = vi.fn()
    const onProgress = vi.fn()
    const h = createZPlayer(document.createElement('div'), { source: { src: 'live' }, live: true, onLiveEnded, onProgress })
    const el = h.element as unknown as FakeMuxPlayer
    el.dispatchEvent(new CustomEvent('error', { detail: { message: 'gone' } }))
    el.dispatchEvent(new Event('ended'))
    expect(onLiveEnded).toHaveBeenCalledTimes(2)
    h.destroy()
    expect(onProgress).not.toHaveBeenCalled() // no resume position for a live
  })
})
