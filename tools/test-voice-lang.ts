/* ============================================================================
   Two spoken languages, end to end in node

   The Excel columns (testo / testo_pt / testo_en), the import merge that adds
   and never removes, which durations an import may write, the ITA / BRA voice
   names and the language-aware voice choice, one Studio session switched
   between languages, the audio slot per language, and which file a person's
   app language plays. Every function here is the shipping code path.

       npx esbuild tools/test-voice-lang.ts --bundle --platform=node --format=esm \
         --external:xlsx "--define:import.meta.env={}" --outfile=tvl.mjs && node tvl.mjs
     (from the repo root, so the external xlsx resolves; delete tvl.mjs after)
   ============================================================================ */

import * as XLSX from 'xlsx'
import { parsePlainTimeline, type PlainTimeline } from '../src/admin/plainTimeline'
import { describeImportPlan, entryForPublish, mergeScripts, planPlainImport } from '../src/admin/publishPlain'
import { buildScriptIndex, missingScripts, plainToStudioTracks, resolvePlainVoice } from '../src/admin/plainStudio'
import { withAudioUrl } from '../src/admin/attachAudio'
import { parseVoiceName, registerVoices, defaultPrimary, type CatalogVoice } from '../src/tts/voiceCatalog'
import { toCatalogVoice } from '../src/tts/voiceSync'
import { canonicalVoiceClip, isTextMissing, switchClipLang } from '../src/studio/sessionLang'
import { audioLangSummary, audioLangs, durationState, plainFor, type CatalogProtocol } from '../src/data/catalog'
import { audioUrlFor } from '../src/data/liveCatalog'
import { patientTitle } from '../src/types/domain'
import { newProtocolEntry } from '../src/admin/CatalogAdmin'
import { cardDraftFrom, applyCardDraft } from '../src/admin/ProtocolCard'
import type { SeedClip } from '../src/compose/types'
import type { VoiceParams } from '../src/studio/multitrack'

let pass = 0
const fails: string[] = []
function assert(cond: unknown, what: string): void {
  if (cond) { pass += 1; console.log('ok  :', what) }
  else { fails.push(what); console.log('FAIL:', what) }
}

/* ------------------------------------------------------------- workbooks */

const HEAD = ['clip_id', 'traccia', 'tipo', 'fase', 'start_s', 'end_s', 'volume_lufs', 'fade_in_s', 'fade_out_s', 'ambiente', 'archetipo', 'modalita', 'tipo_contenuto', 'set_affermazioni', 'intervallo_s', 'testo']

interface Row { id: string; it?: string; pt?: string; start?: number }
function workbook(opts: { minutes: number; lines: Row[]; affs: Row[]; withPt: boolean; ostinato?: { it: string; pt?: string } }): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  const total = opts.minutes * 60
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['GOOD LOOP — GL-ANX 1.1'],
    ['Calma e Sicurezza Interiore — v2.0'],
  ]), 'README')
  const head = opts.withPt ? [...HEAD, 'testo_pt', 'testo_en'] : HEAD
  const rows: unknown[][] = [head]
  rows.push(['SC-001', 'SCN-1', 'Soundscape', '1', 0, total, -28, 2, 3, 'lago calmo', '', '', '', '', '', ''])
  for (const [i, l] of opts.lines.entries()) {
    const start = l.start ?? 10 + i * 20
    const r: unknown[] = [l.id, 'VOX-1', 'Voice', '1', start, start + 15, -16, 0, 0, '', 'Materna [F]', 'normale', 'linea', '', '', l.it ?? '']
    if (opts.withPt) r.push(l.pt ?? '', '')
    rows.push(r)
  }
  const loop: unknown[] = ['VL-001', 'VOX-2', 'Voice', '4', 200, 300, -19, 0, 0, '', 'Paterna [M]', 'normale', 'loop', 'CSI-01..03', 20, '']
  if (opts.withPt) loop.push('', '')
  rows.push(loop)
  if (opts.ostinato) {
    const o: unknown[] = ['VW-001', 'VOX-W', 'Voice', '5', 300, 340, -30, 0, 0, '', 'Materna [F]', 'sussurrato', 'loop', 'REF-01', '', '']
    if (opts.withPt) o.push('', '')
    rows.push(o)
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `Quick ${opts.minutes} min`)
  const affHead = opts.withPt ? ['ID', 'testo', 'testo_pt', 'set', 'durata_s'] : ['ID', 'testo', 'set', 'durata_s']
  const affRows: unknown[][] = [affHead]
  for (const a of opts.affs) affRows.push(opts.withPt ? [a.id, a.it ?? '', a.pt ?? '', 'Quick-Std-Deep', 3] : [a.id, a.it ?? '', 'Quick-Std-Deep', 3])
  if (opts.ostinato) affRows.push(opts.withPt ? ['REF-01', opts.ostinato.it, opts.ostinato.pt ?? '', 'Quick-Std-Deep', 3] : ['REF-01', opts.ostinato.it, 'Quick-Std-Deep', 3])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(affRows), 'Affermazioni')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return out
}

const LINES_IT: Row[] = [
  { id: 'VC-001', it: 'Sono al sicuro.' },
  { id: 'VC-002', it: 'Respiro lentamente.' },
  { id: 'VC-003', it: 'Il corpo si rilassa.' },
]
const LINES_BI: Row[] = [
  { id: 'VC-001', it: 'Sono al sicuro.', pt: 'Estou seguro.' },
  { id: 'VC-002', it: 'Respiro lentamente.', pt: 'Respiro devagar.' },
  { id: 'VC-003', it: 'Il corpo si rilassa.' }, // Portuguese not written yet
]
const AFFS_IT: Row[] = [{ id: 'CSI-01', it: 'Pace.' }, { id: 'CSI-02', it: 'Calma.' }, { id: 'CSI-03', it: 'Fiducia.' }]
const AFFS_BI: Row[] = [{ id: 'CSI-01', it: 'Pace.', pt: 'Paz.' }, { id: 'CSI-02', it: 'Calma.', pt: 'Calma.' }, { id: 'CSI-03', it: 'Fiducia.', pt: 'Confiança.' }]
const OSTINATO = { it: 'calore... sole... pelle', pt: 'calor... sol... pele' }

async function parse(buf: ArrayBuffer): Promise<PlainTimeline> {
  const r = await parsePlainTimeline(buf)
  if (!r.timeline) throw new Error(r.error)
  return { ...r.timeline, code: 'GL-ANX 1.1' }
}

async function main() {
  /* ----------------------------------------------------------- 1. parse */
  console.log('\n--- 1. the Excel: testo / testo_pt ---')
  const itOnly = await parse(workbook({ minutes: 6, lines: LINES_IT, affs: AFFS_IT, withPt: false, ostinato: { it: OSTINATO.it } }))
  const bi = await parse(workbook({ minutes: 6, lines: LINES_BI, affs: AFFS_BI, withPt: true, ostinato: OSTINATO }))

  assert(itOnly.issues.every((i) => i.level !== 'error'), 'an Italian-only workbook (no testo_pt column) is valid')
  assert(itOnly.issues.some((i) => i.code === 'script' && /Solo italiano/.test(i.message)), 'and says once that it is Italian-only')
  const vc1 = bi.versions[0].clips.find((c) => c.clipId === 'VC-001')!
  assert(vc1.testo === 'Sono al sicuro.' && vc1.testoByLang?.['pt-BR'] === 'Estou seguro.', 'testo = Italian, testo_pt = Portuguese, on the same clip')
  assert(bi.affirmations.find((a) => a.id === 'CSI-03')?.testoByLang?.['pt-BR'] === 'Confiança.', 'the Affermazioni sheet carries testo_pt too')
  const missingInfo = bi.issues.filter((i) => i.code === 'script' && i.clipId === 'VC-003')
  assert(missingInfo.length === 1 && missingInfo[0].level === 'info', 'a clip with Italian and no Portuguese is an INFO line, not an error')
  assert(bi.issues.every((i) => i.level !== 'error'), 'the two-language workbook has no errors')

  /* ------------------------------------------------------------ 2. merge */
  console.log('\n--- 2. import = add: an old Italian-only file never wipes the Portuguese ---')
  const { merged, kept } = mergeScripts(bi, itOnly)
  const m1 = merged.versions[0].clips.find((c) => c.clipId === 'VC-001')!
  assert(m1.testoByLang?.['pt-BR'] === 'Estou seguro.', 'VC-001 keeps its stored Portuguese')
  assert(m1.testo === 'Sono al sicuro.', 'and its Italian')
  assert(merged.affirmations.find((a) => a.id === 'CSI-01')?.testoByLang?.['pt-BR'] === 'Paz.', 'affirmations keep their Portuguese (matched by id)')
  assert((kept['pt-BR'] ?? 0) >= 5, `the merge counts what it kept (${kept['pt-BR']} Portuguese texts)`)
  assert(!merged.issues.some((i) => /Solo italiano/.test(i.message)), 'and the "Italian-only" note is recomputed away — it would be untrue now')

  const changedIt = await parse(workbook({ minutes: 6, lines: [{ ...LINES_IT[0], it: 'Sono davvero al sicuro.' }, LINES_IT[1], { ...LINES_IT[2], start: 55 }], affs: AFFS_IT, withPt: false, ostinato: { it: OSTINATO.it } }))
  const stored6: CatalogProtocol = {
    code: 'GL-ANX 1.1', family: 'GL-ANX', title: 'Calma', blurb: '', phases: [], enabled: true, source: 'imported', tenants: 'all', audioReady: true, updatedAt: 1,
    versions: [{ duration: 6, audioUrl: { it: 'https://x/6-it.mp3' } }],
    plainByDuration: { 6: bi },
    studioByDuration: { 6: { name: 'saved', lengthSec: 360, masterGain: 0.8, tracks: [], savedAt: 42 } },
    publicTitle: 'Un respiro', tags: ['sera'], coverUrl: 'https://x/cover.jpg',
    i18n: { 'pt-BR': { publicTitle: 'Um respiro' } },
  }
  const plan = planPlainImport({ timeline: changedIt, existing: stored6, selected: 6 })
  const d6 = plan.diffs[0]
  assert(d6.textChanged.it?.includes('VC-001'), 'the compare finds the changed Italian line')
  assert(!d6.textChanged['pt-BR'], 'and no Portuguese change (the file had none to change)')
  assert(d6.paramChanged.includes('VC-003'), 'and the moved clip as a timing change')
  const lines = describeImportPlan(plan, 6)
  console.log('      summary:', lines.join(' | '))
  assert(lines.some((l) => /testo italiano cambiato/.test(l)) && lines.some((l) => /portoghese già salvati/.test(l)), 'the summary says both, in Italian')

  const same = planPlainImport({ timeline: bi, existing: stored6, selected: 6 })
  assert(same.nothing && describeImportPlan(same, 6).some((l) => /identico/.test(l)), 'importing the same file again: "identico: niente da importare"')

  const entry = entryForPublish({ timeline: changedIt, existing: stored6, selected: 6, keepDraft: true, intoExisting: true })
  assert(entry.studioByDuration?.[6]?.savedAt === 42, 'the Studio session is untouched by an import')
  assert(entry.versions[0].audioUrl?.it === 'https://x/6-it.mp3', 'so is the published audio')
  assert(entry.publicTitle === 'Un respiro' && entry.tags?.join() === 'sera' && entry.coverUrl === 'https://x/cover.jpg' && entry.i18n?.['pt-BR']?.publicTitle === 'Um respiro', 'and the names, tags and cover')
  assert(plainFor(entry, 6)?.versions[0].clips.find((c) => c.clipId === 'VC-002')?.testoByLang?.['pt-BR'] === 'Respiro devagar.', 'the stored Portuguese survives the write')

  /* ------------------------------------------- 3. only the selected duration */
  console.log('\n--- 3. a 6-minute file under the 12m chip does not overwrite 6 ---')
  const six = await parse(workbook({ minutes: 6, lines: [{ id: 'VC-001', it: 'Diverso.' }], affs: AFFS_IT, withPt: false }))
  const wrongChip = planPlainImport({ timeline: six, existing: stored6, selected: 12 })
  assert(!wrongChip.written[6] && wrongChip.skipped.some((s) => s.duration === 6), 'the stored 6-minute timeline is NOT written')
  assert(wrongChip.missingSelected, 'and the summary says the file has no 12-minute version')
  const e2 = entryForPublish({ timeline: six, existing: stored6, selected: 12, keepDraft: true, intoExisting: true })
  assert(plainFor(e2, 6)?.versions[0].clips.find((c) => c.clipId === 'VC-001')?.testo === 'Sono al sicuro.', 'byte for byte the stored one')
  const fresh = { ...stored6, plainByDuration: {} }
  const fill = planPlainImport({ timeline: six, existing: fresh, selected: 12 })
  assert(!!fill.written[6], 'a duration with NO timeline yet is still filled from the file')

  /* ------------------------------------------------------------ 4. voices */
  console.log('\n--- 4. ITA / BRA voices ---')
  const p1 = parseVoiceName('ITA MATERNAL (F)')
  const p2 = parseVoiceName('BRA - MATERNAL')
  const p3 = parseVoiceName('[ok] ITA ASMR (M)')
  const p4 = parseVoiceName('[ok] PATERNAL - ITA')
  const p5 = parseVoiceName('[ok] PATERNAL - BRA')
  const p6 = parseVoiceName('Borges - Slow, Calm')
  assert(p1.language === 'it' && p1.archetype === 'maternal' && p1.gender === 'F', `"ITA MATERNAL (F)" → it · maternal · F`)
  assert(p2.language === 'pt-BR' && p2.archetype === 'maternal', `"BRA - MATERNAL" → pt-BR · maternal`)
  assert(p3.language === 'it' && p3.archetype === 'whisper' && p3.gender === 'M' && p3.approved, `"[ok] ITA ASMR (M)" → it · whisper · M · approved`)
  assert(p4.language === 'it' && p4.archetype === 'paternal', 'the old suffix form "- ITA" still parses')
  assert(p5.language === 'pt-BR' && p5.archetype === 'paternal', 'and "- BRA" is Portuguese')
  assert(p6.language === undefined && toCatalogVoice({ voice_id: 'x', name: 'Borges - Slow, Calm', category: 'cloned' }).language === 'it', 'no marker → Italian')

  const account: CatalogVoice[] = [
    { id: 'aYBXyupCnZqrSVuPsR5i', name: 'Maternal', gender: 'F', archetype: 'maternal', language: 'it', approved: true },
    { id: 'Zd5ZRxsNxAoZHMRh5hdm', name: 'Paternal', gender: 'M', archetype: 'paternal', language: 'it', approved: true },
    { id: 'ita-asmr-f', name: 'ASMR (F)', gender: 'F', archetype: 'whisper', language: 'it', approved: true },
    toCatalogVoice({ voice_id: 'bra-mat', name: '[ok] BRA MATERNAL (F)', category: 'generated' }),
    toCatalogVoice({ voice_id: 'bra-pat', name: '[ok] PATERNAL - BRA', category: 'generated' }),
    toCatalogVoice({ voice_id: 'bra-asmr-f', name: '[ok] BRA ASMR (F)', category: 'generated' }),
  ]
  registerVoices(account)
  assert(resolvePlainVoice('Materna [F]', 'normale', 'it').voice.id === 'aYBXyupCnZqrSVuPsR5i', 'Materna, Italian → the ITA maternal default')
  assert(resolvePlainVoice('Materna [F]', 'normale', 'pt-BR').voice.id === 'bra-mat', 'Materna, Portuguese → the BRA maternal voice')
  assert(resolvePlainVoice('Paterna [M]', 'normale', 'pt-BR').voice.id === 'bra-pat', 'Paterna, Portuguese → the BRA paternal voice')
  assert(resolvePlainVoice('Materna [F]', 'sussurrato', 'pt-BR').voice.id === 'bra-asmr-f', 'sussurrato, Portuguese → the BRA whisper of the same gender')
  assert(resolvePlainVoice('Guerriera', 'normale', 'pt-BR').voice.id === 'bra-mat', 'no BRA warrior → the Portuguese default (maternal)')
  assert(defaultPrimary('pt-BR').id === 'bra-mat' && defaultPrimary('it').id === 'aYBXyupCnZqrSVuPsR5i', 'each language has its own default')

  /* ------------------------------------------------ 5. seeding, two ways */
  console.log('\n--- 5. the Studio seed: same session, two languages ---')
  const v = bi.versions[0]
  const seedIt = plainToStudioTracks(bi, v, { seed: 7, lang: 'it' })
  const seedPt = plainToStudioTracks(bi, v, { seed: 7, lang: 'pt-BR' })
  const strip = (tracks: typeof seedIt.tracks) => JSON.stringify(tracks.map((t) => ({ ...t, clips: t.clips.map((c) => {
    const p = { ...(c.params as VoiceParams) } as Record<string, unknown>
    delete p.voiceId; delete p.voiceArchetype; delete p.voiceGender; delete p.voiceLang
    return { ...c, text: undefined, params: p }
  }) })))
  assert(strip(seedIt.tracks) === strip(seedPt.tracks), 'every track, clip time, level, fade and fx is identical in Italian and Portuguese')
  const voiceClips = (tracks: typeof seedIt.tracks) => tracks.filter((t) => t.type === 'voice').flatMap((t) => t.clips)
  const ptVc1 = voiceClips(seedPt.tracks).find((c) => c.sourceId === 'clip:VC-001')!
  assert(ptVc1.text === 'Estou seguro.' && (ptVc1.params as VoiceParams).voiceId === 'bra-mat', 'in Portuguese VC-001 speaks "Estou seguro." with the BRA maternal voice')
  assert(ptVc1.textByLang?.it === 'Sono al sicuro.' && ptVc1.voiceByLang?.it?.voiceId === 'aYBXyupCnZqrSVuPsR5i', 'and still carries its Italian text and voice')
  const ptVc3 = voiceClips(seedPt.tracks).find((c) => c.sourceId === 'clip:VC-003')!
  assert(!ptVc3.text && isTextMissing(ptVc3), 'VC-003 has no Portuguese: empty and marked missing, never Italian')
  const frags = voiceClips(seedPt.tracks).filter((c) => c.sourceId?.startsWith('aff:REF-01#'))
  assert(frags.length > 0 && frags[0].text === 'calor' && frags[0].textByLang?.it === 'calore', 'whisper fragments split per language ("calore" / "calor")')
  assert(seedPt.notes.some((n) => /senza testo portoghese/.test(n)), 'the notes name the lines with no Portuguese')
  assert(missingScripts(bi, v, 'pt-BR') === 1 && missingScripts(bi, v, 'it') === 0, 'missingScripts: 1 Portuguese line missing, 0 Italian')

  /* ----------------------------------------------- 6. an old saved session */
  console.log('\n--- 6. a session saved before languages existed, opened in Portuguese ---')
  const scripts = buildScriptIndex(bi)
  const old: SeedClip = { startSec: 10, durationSec: 15, params: { pan: 0, pulseHz: 0.35, toneHz: 320, voiceId: 'aYBXyupCnZqrSVuPsR5i', voiceArchetype: 'maternal', voiceGender: 'F' } as VoiceParams, text: 'Sono al sicuro.', ttsPath: 'tts/a.mp3', ttsText: 'Sono al sicuro.' }
  const r = switchClipLang(old, { lang: 'it', to: 'm' }, { lang: 'pt-BR', to: 'm' }, scripts)
  assert(r.filled && r.clip.text === 'Estou seguro.', 'no source id: its Portuguese is found by its Italian text')
  assert((r.clip.params as VoiceParams).voiceId === 'bra-mat', 'and it is given the BRA voice of the same archetype')
  assert(!r.clip.ttsPath, 'the Italian render is not passed off as Portuguese')
  const back = switchClipLang(r.clip, { lang: 'pt-BR', to: 'm' }, { lang: 'it', to: 'm' }, scripts)
  assert(back.clip.text === 'Sono al sicuro.' && back.clip.ttsPath === 'tts/a.mp3' && (back.clip.params as VoiceParams).voiceId === 'aYBXyupCnZqrSVuPsR5i', 'switching back restores the Italian text, render and voice')
  const canon = canonicalVoiceClip(r.clip, { lang: 'pt-BR', to: 'm' })
  assert(canon.text === 'Sono al sicuro.' && canon.textByLang?.['pt-BR'] === 'Estou seguro.' && (canon.params as VoiceParams).voiceId === 'aYBXyupCnZqrSVuPsR5i', 'a save made in Portuguese is canonical: Italian in the live fields, both in the maps')
  const orphan: SeedClip = { ...old, text: 'Una riga che non è nel foglio.' }
  const o = switchClipLang(orphan, { lang: 'it', to: 'm' }, { lang: 'pt-BR', to: 'm' }, scripts)
  assert(o.missing && o.clip.text === '', 'a line with no Portuguese anywhere shows as missing')

  /* --------------------------------------------------- 7. audio per language */
  console.log('\n--- 7. publishing Portuguese leaves the Italian audio alone ---')
  const pub = withAudioUrl(stored6, 6, 'pt-BR', 'https://x/6-pt.mp3', 99)
  assert(pub.versions[0].audioUrl?.it === 'https://x/6-it.mp3' && pub.versions[0].audioUrl?.['pt-BR'] === 'https://x/6-pt.mp3', 'only audioUrl["pt-BR"] is written')
  assert(audioLangs(pub, 6).join() === 'it,pt-BR' && audioLangSummary(pub, 6) === 'IT ✓ · PT ✓', 'the console reads "IT ✓ · PT ✓"')
  const itOnlyRow: CatalogProtocol = { ...stored6, versions: [{ duration: 6, audioUrl: { it: 'https://x/6-it.mp3' } }] }
  assert(durationState(itOnlyRow, 6) === 'published', 'an Italian-only duration is published (it used to need a pt-BR key)')

  /* --------------------------------------------------------- 8. playback */
  console.log('\n--- 8. which file a person hears ---')
  assert(audioUrlFor(pub, 6, 'it') === 'https://x/6-it.mp3', 'it → the Italian file')
  assert(audioUrlFor(pub, 6, 'pt-BR') === 'https://x/6-pt.mp3', 'pt-BR → the Portuguese file')
  assert(audioUrlFor(pub, 6, 'en') === 'https://x/6-pt.mp3', 'en → the Portuguese file')
  assert(audioUrlFor(itOnlyRow, 6, 'pt-BR') === 'https://x/6-it.mp3' && audioUrlFor(itOnlyRow, 6, 'en') === 'https://x/6-it.mp3', 'only Italian exists: everyone still gets a session')
  const ptOnly = withAudioUrl({ ...stored6, versions: [{ duration: 6 }] }, 6, 'pt-BR', 'https://x/6-pt.mp3')
  assert(audioUrlFor(ptOnly, 6, 'it') === 'https://x/6-pt.mp3', 'only Portuguese exists: the Italian reader gets it too')

  /* ------------------------------------------------------------ 9. names */
  console.log('\n--- 9. names follow the reader ---')
  const named: CatalogProtocol = { ...stored6, publicTitle: 'Stress 1', i18n: { 'pt-BR': { publicTitle: 'Estresse 1' } } }
  assert(patientTitle(named, 'it') === 'Stress 1', 'it reads the Italian name')
  assert(patientTitle(named, 'pt-BR') === 'Estresse 1', 'pt-BR reads the Portuguese name')
  assert(patientTitle(named, 'en') === 'Estresse 1', 'en with no English name reads the Portuguese one')
  assert(patientTitle({ ...named, i18n: { ...named.i18n, en: { publicTitle: 'Stress One' } } }, 'en') === 'Stress One', 'and its own when there is one')
  const created = newProtocolEntry({ code: 'GL-ANX 9.1', title: 'T', publicTitle: 'Uno', publicBlurb: '', i18n: { 'pt-BR': { publicTitle: 'Um' } }, tags: [], coverUrl: 'https://x/c.jpg', tier: 'green', claimsGate: { answers: {}, approvedBy: '', approvedAt: null } as never })
  assert(created.i18n?.['pt-BR']?.publicTitle === 'Um' && created.coverUrl === 'https://x/c.jpg', 'Crea nuovo keeps the other languages and the cover')
  const legacyIt: CatalogProtocol = { ...stored6, publicTitle: 'Base', i18n: { it: { publicTitle: 'Italiano', title: 'Clinico IT' } } }
  const draft = cardDraftFrom(legacyIt)
  assert(draft.publicTitle === 'Italiano' && !draft.i18n.it?.publicTitle && draft.i18n.it?.title === 'Clinico IT', 'the editor folds an i18n.it public name into the Italian (base) row')
  const saved = applyCardDraft(draft, legacyIt)
  assert(saved.publicTitle === 'Italiano' && patientTitle(saved, 'it') === 'Italiano' && saved.i18n?.it?.title === 'Clinico IT', 'and saving keeps what an Italian reader saw')

  console.log(`\n${pass} passed, ${fails.length} failed`)
  if (fails.length) { for (const f of fails) console.log('  FAIL:', f); process.exit(1) }
}

main().catch((e) => { console.error(e); process.exit(1) })
