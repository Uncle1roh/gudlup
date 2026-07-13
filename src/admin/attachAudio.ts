/* ============================================================================
   Good Loop — attach rendered audio to a catalog protocol version
   One shared path used by BOTH the PDF→audio importer and the Sound Studio:
   encode the MP3 streaming copy, upload it to the protocol-audio bucket, and
   bind the URL onto the protocol version — from then on that exact file plays
   in the employee app and in monitored sessions.
   ============================================================================ */

import { getSupabaseClient, hasSupabaseEnv } from '../auth/supabaseClient'
import { audioBufferToMp3 } from '../lib/mp3'
import { registerProtocol } from '../data/protocols'
import type { DataProvider } from '../data/provider'
import type { CatalogProtocol } from '../data/catalog'
import type { Duration } from '../types/domain'

export interface AttachResult { url: string; protocol: CatalogProtocol }

export async function attachRenderedAudio(
  dp: DataProvider,
  code: string,
  duration: Duration,
  buffer: AudioBuffer,
): Promise<AttachResult> {
  if (!hasSupabaseEnv()) {
    throw new Error('Attaching needs the Supabase env (mock mode is download-only).')
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const sb = getSupabaseClient(url, anon)

  const protocols = await dp.listProtocols()
  const proto = protocols.find((p) => p.code === code)
  if (!proto) throw new Error(`Protocol ${code} is not in the catalog.`)
  if (!proto.versions.some((v) => v.duration === duration)) {
    throw new Error(`${code} has no ${duration}-minute version to attach to.`)
  }

  const mp3 = audioBufferToMp3(buffer, 128)
  const safeCode = code.replace(/[^A-Za-z0-9_-]+/g, '_')
  const path = `${safeCode}/${duration}min-ptBR.mp3`
  const { error: upErr } = await sb.storage.from('protocol-audio')
    .upload(path, mp3, { upsert: true, contentType: 'audio/mpeg' })
  if (upErr) throw upErr
  const { data: pub } = sb.storage.from('protocol-audio').getPublicUrl(path)

  const next: CatalogProtocol = {
    ...proto,
    versions: proto.versions.map((v) =>
      v.duration === duration
        ? { ...v, audioUrl: { ...(v.audioUrl ?? {}), 'pt-BR': pub.publicUrl } }
        : v),
    audioReady: true,
    updatedAt: Date.now(),
  }
  await dp.saveProtocol(next)
  registerProtocol(next)
  return { url: pub.publicUrl, protocol: next }
}
