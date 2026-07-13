/* ============================================================================
   Good Loop — MP3 encoding (streaming copy)
   The 44.1 kHz / 16-bit WAV stays the archival master (FN-06), but it's the
   wrong thing to stream: a 24-minute session is ~250 MB, which is what made
   attached audio choke on mobile. The catalog therefore stores an MP3 copy
   (128 kbps ≈ 23 MB for 24 min) encoded here, in the browser, at upload time.
   ============================================================================ */

import { Mp3Encoder } from '@breezystack/lamejs'

const BLOCK = 1152 // MPEG-1 layer III samples per frame

function toInt16(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length)
  for (let i = 0; i < f32.length; i++) {
    const v = Math.max(-1, Math.min(1, f32[i]))
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff
  }
  return out
}

export function audioBufferToMp3(buffer: AudioBuffer, kbps = 128, onProgress?: (done: number) => void): Blob {
  const channels = Math.min(2, buffer.numberOfChannels)
  const left = toInt16(buffer.getChannelData(0))
  const right = channels === 2 ? toInt16(buffer.getChannelData(1)) : left
  const encoder = new Mp3Encoder(2, buffer.sampleRate, kbps)

  const chunks: Uint8Array[] = []
  for (let i = 0; i < left.length; i += BLOCK) {
    const l = left.subarray(i, i + BLOCK)
    const r = right.subarray(i, i + BLOCK)
    const frame = encoder.encodeBuffer(l, r)
    if (frame.length) chunks.push(frame)
    if (onProgress && i % (BLOCK * 400) === 0) onProgress(i / left.length)
  }
  const tail = encoder.flush()
  if (tail.length) chunks.push(tail)
  onProgress?.(1)

  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' })
}
