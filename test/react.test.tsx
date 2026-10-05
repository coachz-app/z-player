import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@mux/mux-player', () => ({}))
vi.mock('media-chrome/lang/fr.js', () => ({}))
vi.mock('media-chrome/utils/i18n.js', () => ({ setLanguage: () => {} }))

class FakeMuxPlayer extends HTMLElement {
  paused = true
  currentTime = 0
  duration = NaN
  readyState = 0
  pause() {
    this.paused = true
  }
  play() {
    this.paused = false
  }
}

beforeAll(() => {
  customElements.define('mux-player', FakeMuxPlayer)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

const { ZPlayer } = await import('../src/react')

type Fake = FakeMuxPlayer & { playbackId?: string; tokens?: { playback?: string } }

const jwt = (inSeconds: number, id: string) => {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${b64({ alg: 'none' })}.${b64({ exp: Math.floor(Date.now() / 1000) + inSeconds, id })}.sig`
}

describe('ZPlayer (React)', () => {
  it('keeps the same player when only the tokens change, rebuilds it for another video', () => {
    const box = document.createElement('div')
    const root = createRoot(box)
    const render = (playbackId: string, playback: string) =>
      act(() => root.render(<ZPlayer source={{ playbackId, tokens: { playback } }} live />))
    const player = () => box.querySelector('mux-player') as Fake

    render('pb1', jwt(60, 'a')) // expires soon
    const first = player()
    expect(first.playbackId).toBe('pb1')
    first.play()

    // A refetch brings a fresh token: the expiring one is replaced in place.
    const fresh = jwt(3600, 'b')
    render('pb1', fresh)
    expect(player()).toBe(first)
    expect(first.getAttribute('playback-token')).toBe(fresh)

    // The next refetches bring other valid tokens: nothing happens.
    render('pb1', jwt(3600, 'c'))
    expect(player()).toBe(first)
    expect(first.getAttribute('playback-token')).toBe(fresh)
    expect(first.paused).toBe(false)

    // Another video: a new player.
    render('pb2', jwt(3600, 'e'))
    expect(player()).not.toBe(first)
    expect(player().playbackId).toBe('pb2')
    expect(box.querySelectorAll('mux-player')).toHaveLength(1)
    act(() => root.unmount())
  })
})
