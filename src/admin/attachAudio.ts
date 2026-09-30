/* ============================================================================
   Good Loop — attach rendered audio to a catalog protocol version
   One shared path used by the importers (document + datasheet) and the Sound
   Studio: encode the MP3 streaming copy, upload it to the protocol-audio
   bucket, and bind the URL onto the protocol version — from then on that exact
   file plays in the employee app and in monitored sessions.

   Session encode is 192 kbps (bumped from 128 with Renderer v3: real music
   stems + soundscape textures deserve the headroom; ~35 MB for 24 min).

   PER LANGUAGE. A version holds one file per spoken language, and attaching
   one writes ONLY that language's slot: publishing the Portuguese take of the
   12-minute session leaves the Italian take — and the 6- and 24-minute
   versions — exactly as they were. The file used to be written to
   `…min-ptBR.mp3` and keyed 'pt-BR' whatever it was spoken in, which is how
   every Italian session came to be filed as Portuguese (fixed in the data by
   supabase/12-audio-language.sql). Files uploaded under the old name keep it.
   ============================================================================ */

import { getSupabaseClient, hasSupabaseEnv } from '../auth/supabaseClient'
import { audioBufferToMp3 } from '../lib/mp3'
import { registerProtocol } from '../data/protocols'
import type { DataProvider } from '../data/provider'
import type { CatalogProtocol } from '../data/catalog'
import type { Duration } from '../types/domain'
import type { VoiceLang } from '../tts/voiceLang'

export const SESSION_MP3_KBPS = 192

export interface AttachResult { url: string; protocol: CatalogProtocol; demo?: boolean }

/** Storage path of one duration's file in one language. */
export function audioPath(code: string, duration: Duration, lang: VoiceLang): string {
  const safeCode = code.replace(/[^A-Za-z0-9_-]+/g, '_')
  return `${safeCode}/${duration}min-${lang}.mp3`
}

/**
 * The protocol with `url` as the `lang` audio of `duration` — and every other
 * language, every other duration, every other field exactly as it was. Pure;
 * asserted in tools/test-voice-lang.ts.
 */
export function withAudioUrl(proto: CatalogProtocol, duration: Duration, lang: VoiceLang, url: string, now = Date.now()): CatalogProtocol {
  return {
    ...proto,
    versions: proto.versions.map((v) =>
      v.duration === duration
        ? { ...v, audioUrl: { ...(v.audioUrl ?? {}), [lang]: url } }
        : v),
    audioReady: true,
    updatedAt: now,
  }
}

export async function attachRenderedAudio(
  dp: DataProvider,
  code: string,
  duration: Duration,
  buffer: AudioBuffer,
  lang: VoiceLang,
  kbps: number = SESSION_MP3_KBPS,
): Promise<AttachResult> {
  const protocols = await dp.listProtocols()
  const proto = protocols.find((p) => p.code === code)
  if (!proto) throw new Error(`Il protocollo ${code} non è nel catalogo.`)
  if (!proto.versions.some((v) => v.duration === duration)) {
    throw new Error(`${code} non ha una versione da ${duration} minuti a cui collegarlo.`)
  }

  const mp3 = audioBufferToMp3(buffer, kbps)

  /* DEMO (no backend): the file is bound as an in-memory object URL. It plays
     in this tab, in every surface, exactly as a published file would — and
     disappears with the tab, like everything else the demo catalog holds. The
     alternative was refusing, which left the one flow the demo exists to show
     (publish, then hear it in the app) impossible to show. */
  if (!hasSupabaseEnv()) {
    const url = URL.createObjectURL(mp3)
    const next = withAudioUrl(proto, duration, lang, url)
    await dp.saveProtocol(next)
    registerProtocol(next)
    return { url, protocol: next, demo: true }
  }

  const sbUrl = import.meta.env.VITE_SUPABASE_URL as string
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const sb = getSupabaseClient(sbUrl, anon)
  const path = audioPath(code, duration, lang)
  const { error: upErr } = await sb.storage.from('protocol-audio')
    .upload(path, mp3, { upsert: true, contentType: 'audio/mpeg' })
  if (upErr) throw upErr
  const { data: pub } = sb.storage.from('protocol-audio').getPublicUrl(path)

  const next = withAudioUrl(proto, duration, lang, pub.publicUrl)
  await dp.saveProtocol(next)
  registerProtocol(next)
  return { url: pub.publicUrl, protocol: next }
}
