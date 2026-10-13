import { beforeEach, describe, expect, it, vi } from 'vitest'

const synthesize = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api/speech', () => ({ speechApi: { synthesize } }))

import { getState, play, stop } from './speech-player'

class FakeAudio {
  static created: FakeAudio[] = []
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  paused = true
  constructor(public src: string) { FakeAudio.created.push(this) }
  play() { this.paused = false; return Promise.resolve() }
  pause() { this.paused = true }
}

describe('speech player', () => {
  beforeEach(() => {
    stop()
    synthesize.mockReset().mockResolvedValue(new Blob(['mp3']))
    FakeAudio.created = []
    vi.stubGlobal('Audio', FakeAudio)
    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:${++n}`)
    URL.revokeObjectURL = vi.fn()
  })

  it('plays, reuses cached audio and lets only one reading run', async () => {
    await play('a', 'texto uno')
    expect(getState()).toEqual({ id: 'a', status: 'playing' })
    await play('b', 'texto dos')
    expect(FakeAudio.created[0].paused).toBe(true)
    expect(getState().id).toBe('b')
    await play('a', 'texto uno')
    expect(synthesize).toHaveBeenCalledTimes(2)
    FakeAudio.created.at(-1)!.onended!()
    expect(getState()).toEqual({ id: null, status: 'idle' })
  })

  it('returns to idle and rethrows when synthesis fails', async () => {
    synthesize.mockRejectedValueOnce(new Error('no tts model'))
    await expect(play('x', 'hola nuevo')).rejects.toThrow('no tts model')
    expect(getState().status).toBe('idle')
  })
})
