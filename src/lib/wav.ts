/**
 * Encode an AudioBuffer (from OfflineAudioContext rendering) into a 16-bit PCM
 * WAV file. This is what lets the Studio export a real, downloadable .wav that
 * the B2C player can then stream.
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const numFrames = buffer.length
  const bytesPerSample = 2
  const blockAlign = numCh * bytesPerSample
  const dataSize = numFrames * blockAlign

  const arr = new ArrayBuffer(44 + dataSize)
  const view = new DataView(arr)
  let offset = 0

  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i))
  }
  const writeU32 = (v: number) => { view.setUint32(offset, v, true); offset += 4 }
  const writeU16 = (v: number) => { view.setUint16(offset, v, true); offset += 2 }

  // RIFF header
  writeStr('RIFF')
  writeU32(36 + dataSize)
  writeStr('WAVE')
  // fmt chunk
  writeStr('fmt ')
  writeU32(16)
  writeU16(1) // PCM
  writeU16(numCh)
  writeU32(sampleRate)
  writeU32(sampleRate * blockAlign)
  writeU16(blockAlign)
  writeU16(16) // bits per sample
  // data chunk
  writeStr('data')
  writeU32(dataSize)

  const channels: Float32Array[] = []
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c))

  for (let i = 0; i < numFrames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([view], { type: 'audio/wav' })
}
