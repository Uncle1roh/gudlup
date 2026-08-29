/* The Excel `fx` column, the `sequenza` column, and the silent-lane report.

   Synthetic timelines for the rules, and a generated .xlsx for the round trip:
   these are statements about how a cell is read and what the seed does with
   it, and they have to be provable without a PO workbook on disk.

   Run:
     node_modules/.bin/esbuild tools/test-plain-fx.ts --bundle --platform=node \
       --define:import.meta.env={} --outfile=<tmp>/fx.cjs && node <tmp>/fx.cjs
*/
import { parseFxCell, applyFxSpecs, describeFx, fxKey } from '../src/admin/plainFx'
import { defaultEffects } from '../src/studio/effects'
import { plainToStudioTracks } from '../src/admin/plainStudio'
import type { PlainAffirmation, PlainClip, PlainTimeline, PlainVersion } from '../src/admin/plainTimeline'

let pass = 0
function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 }
  else { pass++; console.log(`ok  : ${msg}`) }
}
const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

/* ------------------------------------------------------------ the grammar */

{
  const r = parseFxCell('eco')
  assert(r.fx.length === 1 && r.fx[0].kind === 'echo' && !r.problems.length, 'bare "eco" → echo at its defaults')
}
{
  const r = parseFxCell('echo')
  assert(r.fx.length === 1 && r.fx[0].kind === 'echo', 'the English name works too')
}
{
  const r = parseFxCell('eco + riverbero')
  assert(r.fx.map((f) => f.kind).join('|') === 'echo|reverb', '"+" separates two effects')
}
{
  const r = parseFxCell('eco; riverbero; coro')
  assert(r.fx.length === 3, '";" separates as well')
}
{
  const r = parseFxCell('eco, riverbero')
  assert(r.fx.length === 2, 'a bare comma separates effects when it is outside brackets')
}
{
  const r = parseFxCell('eco(ritardo=0.8, mix=35%)')
  assert(r.fx.length === 1 && close(r.fx[0].params.delaySec, 0.8) && close(r.fx[0].params.mix, 0.35),
    'commas INSIDE brackets belong to the parameters')
}
{
  const r = parseFxCell('riverbero(coda=3.2s, mix=25%)')
  assert(close(r.fx[0].params.decaySec, 3.2) && close(r.fx[0].params.mix, 0.25), '"3.2s" and "25%" parse')
}
{
  const r = parseFxCell('riverbero(mix=30)')
  assert(close(r.fx[0].params.mix, 0.3), 'a bare 30 on a 0..1 slider means 30%')
}
{
  const r = parseFxCell('riverbero(mix=0,4)'.replace(',4', '.4'))
  assert(close(r.fx[0].params.mix, 0.4), '0.4 stays 0.4 — only values above 1 are read as percent')
}
{
  const r = parseFxCell('filtro(modo=passa-basso, taglio=4kHz)')
  assert(r.fx[0].kind === 'filter' && r.fx[0].params.mode === 0 && close(r.fx[0].params.cutoff, 4000),
    'passa-basso → lowpass, 4kHz → 4000 Hz')
}
{
  const r = parseFxCell('filter(mode=hp, cutoff=200)')
  assert(r.fx[0].params.mode === 1 && close(r.fx[0].params.cutoff, 200), 'hp → highpass')
}
{
  const r = parseFxCell('coro(voci=4, apertura=28, ottava=on)')
  assert(r.fx[0].kind === 'harmonizer' && r.fx[0].params.voices === 4 && r.fx[0].params.spreadCents === 28 && r.fx[0].params.octave === 1,
    'coro reads voci/apertura/ottava')
}
{
  const r = parseFxCell('saturazione(drive=6)')
  assert(r.fx[0].kind === 'saturation' && r.fx[0].params.drive === 6, 'saturazione(drive)')
}
{
  const r = parseFxCell('off')
  assert(!r.fx.length && !r.problems.length, '"off" is an answer, not an error')
}
{
  const r = parseFxCell('')
  assert(!r.fx.length && !r.problems.length, 'an empty cell asks for nothing')
}
{
  const r = parseFxCell('ECO(Ritardo = 1.2)')
  assert(close(r.fx[0].params.delaySec, 1.2), 'case and spaces around "=" do not matter')
}
{
  const r = parseFxCell('coro(voci=99)')
  assert(r.fx[0].params.voices === 5 && r.problems.length === 1, 'out of range is CLAMPED and reported, never dropped')
}
{
  const r = parseFxCell('vocoder')
  assert(!r.fx.length && r.problems.length === 1 && /sconosciuto/.test(r.problems[0]), 'an unknown effect is reported')
}
{
  const r = parseFxCell('eco(pippo=3)')
  assert(r.fx.length === 1 && r.problems.length === 1 && /parametro sconosciuto/.test(r.problems[0]),
    'an unknown parameter is reported and the effect still enables')
}
{
  const r = parseFxCell('eco(ritardo=0.4) + eco(mix=20%)')
  assert(r.fx.length === 1 && close(r.fx[0].params.delaySec, 0.4) && close(r.fx[0].params.mix, 0.2),
    'the same effect twice in one cell merges')
}

/* ------------------------------------------------------------- applying it */

{
  const rack = applyFxSpecs(undefined, parseFxCell('eco(mix=40%)').fx)
  const echo = rack.find((e) => e.kind === 'echo')!
  const reverb = rack.find((e) => e.kind === 'reverb')!
  assert(echo.enabled && close(echo.params.mix, 0.4), 'the named effect is enabled with its parameter')
  assert(!reverb.enabled, 'the effects the cell did not name stay off')
  assert(close(echo.params.tone, defaultEffects().find((e) => e.kind === 'echo')!.params.tone),
    'parameters the cell did not name keep their defaults')
}
{
  const legacy = applyFxSpecs(undefined, parseFxCell('riverbero(mix=50%)').fx)
  const both = applyFxSpecs(legacy, parseFxCell('eco').fx)
  assert(both.find((e) => e.kind === 'reverb')!.enabled && both.find((e) => e.kind === 'echo')!.enabled,
    'fx stacks on top of what the lane already carries (the legacy eco/riverbero_pct columns)')
}
{
  assert(fxKey(parseFxCell('eco + riverbero').fx) === fxKey(parseFxCell('riverbero + eco').fx),
    'the signature does not depend on the order they were written in')
  assert(fxKey(parseFxCell('eco').fx) !== fxKey(parseFxCell('eco(mix=80%)').fx),
    'different parameters are a different rack')
  assert(fxKey(undefined) === '' && fxKey([]) === '', 'no fx has an empty signature')
}
{
  assert(/Emotional Echo/.test(describeFx(parseFxCell('eco(ritardo=0.8)').fx)), 'describeFx names the effect for the notes')
}

/* ------------------------------------------------------- seeding a session */

function clip(over: Partial<PlainClip> & Pick<PlainClip, 'clipId' | 'traccia' | 'tipo' | 'startS' | 'endS'>): PlainClip {
  return {
    row: 2, faseRaw: '1', faseFrom: 1, faseTo: 1,
    durataS: over.endS - over.startS,
    volumeDb: null, volumeLufs: null, fadeInS: 0, fadeOutS: 0, crossfadePrecS: null,
    ...over,
  }
}

function timelineOf(clips: PlainClip[], affirmations: PlainAffirmation[] = []): { t: PlainTimeline; v: PlainVersion } {
  const v: PlainVersion = {
    sheet: 'Deep', versionKey: 'deep', levelMode: 'offset',
    durationS: 1440, durationMin: 24, clips,
    tracks: [], phases: [], declaredTotal: null, declaredDurationS: null,
  }
  return { t: { code: 'GL-ANX 1.1', title: 'Test', versions: [v], affirmations, issues: [] }, v }
}

const aff = (id: string, testo: string, durataS: number | null = 4): PlainAffirmation => ({
  id, testo, setRaw: 'Deep', inQuick: false, inStandard: false, inDeep: true,
  refrain: !/^csi-/i.test(id), durataS,
})

{
  const { t, v } = timelineOf([
    clip({ clipId: 'SS-1', traccia: 'Soundscape', tipo: 'soundscape', startS: 0, endS: 60, ambiente: 'lago',
      fx: parseFxCell('riverbero(coda=4s, mix=20%)').fx, fxRaw: 'riverbero(coda=4s, mix=20%)' }),
  ])
  const seed = plainToStudioTracks(t, v)
  const rack = seed.tracks[0].effects!
  const rv = rack.find((e) => e.kind === 'reverb')!
  assert(rv.enabled && close(rv.params.decaySec, 4) && close(rv.params.mix, 0.2),
    'fx is not a voice column: a Soundscape lane gets its reverb')
  assert(seed.notes.some((n) => /fx dal foglio/.test(n)), 'the seed says where the rack came from')
}

{
  /* eco=on already splits the lane; the fx column has to land on the SPLIT
     lane, which is where the whispered line actually plays. */
  const { t, v } = timelineOf([
    clip({ clipId: 'VC-1', traccia: 'VOX_A', tipo: 'voice', startS: 0, endS: 20, tipoContenuto: 'linea', testo: 'ciao',
      eco: true, fx: parseFxCell('riverbero(mix=30%)').fx, fxRaw: 'riverbero(mix=30%)' }),
  ])
  const seed = plainToStudioTracks(t, v)
  const lane = seed.tracks.find((x) => x.name === 'VOX_A · eco')!
  assert(!!lane, 'an eco clip still rides the companion lane')
  assert(lane.effects!.find((e) => e.kind === 'echo')!.enabled, 'the legacy eco column still enables the echo')
  assert(close(lane.effects!.find((e) => e.kind === 'reverb')!.params.mix, 0.3), 'and the fx column adds the reverb to the SAME lane')
}

{
  const { t, v } = timelineOf([
    clip({ clipId: 'VC-1', traccia: 'VOX_A', tipo: 'voice', startS: 0, endS: 40, tipoContenuto: 'linea', testo: 'uno',
      fx: parseFxCell('eco').fx, fxRaw: 'eco' }),
    clip({ clipId: 'VC-2', traccia: 'VOX_A', tipo: 'voice', startS: 41, endS: 60, tipoContenuto: 'linea', testo: 'due',
      fx: parseFxCell('eco(mix=90%)').fx, fxRaw: 'eco(mix=90%)' }),
  ])
  const seed = plainToStudioTracks(t, v)
  assert(seed.tracks.length === 1 && seed.tracks[0].clips.length === 2, 'two clips of one traccia stay on one lane')
  assert(close(seed.tracks[0].effects!.find((e) => e.kind === 'echo')!.params.mix, 0.9), 'when they disagree the last one read wins')
  assert(seed.notes.some((n) => /rack fx diverso/.test(n)), 'and the disagreement is reported')
}

/* ---------------------------------------------------------------- sequenza */

{
  const { t, v } = timelineOf([
    clip({
      clipId: 'LP-1', traccia: 'VOX_C_SUSSURRO', tipo: 'voice', startS: 100, endS: 400,
      tipoContenuto: 'loop', modalita: 'sussurrato', sequenza: 'CSI-01@0; CSI-05@60; CSI-09@2:00',
      sequenzaSteps: [{ id: 'CSI-01', offsetS: 0 }, { id: 'CSI-05', offsetS: 60 }, { id: 'CSI-09', offsetS: 120 }],
    }),
  ], [aff('CSI-01', 'uno'), aff('CSI-05', 'cinque'), aff('CSI-09', 'nove')])
  const seed = plainToStudioTracks(t, v)
  const lane = seed.tracks[0]
  assert(lane.clips.length === 3, 'a sequenza places one clip per step — it used to place none')
  assert(lane.clips.map((c) => c.startSec).join('|') === '100|160|220', 'offsets are counted from the clip start')
  assert(lane.clips.map((c) => c.text).join('|') === 'uno|cinque|nove', 'each step speaks its own affirmation')
  assert(!seed.notes.some((n) => n.startsWith('⚠')), 'a lane that plays is not reported as silent')
}

{
  const { t, v } = timelineOf([
    clip({
      clipId: 'LP-1', traccia: 'VOX_C_SUSSURRO', tipo: 'voice', startS: 0, endS: 100,
      tipoContenuto: 'loop', sequenza: 'CSI-01@0; CSI-05@600',
      sequenzaSteps: [{ id: 'CSI-01', offsetS: 0 }, { id: 'CSI-05', offsetS: 600 }],
    }),
  ], [aff('CSI-01', 'uno'), aff('CSI-05', 'cinque')])
  const seed = plainToStudioTracks(t, v)
  assert(seed.tracks[0].clips.length === 1, 'a step past the end of the clip is not placed')
  assert(seed.notes.some((n) => /oltre la fine del clip/.test(n)), 'and it is said out loud')
}

{
  /* GL-ANX 1.1 · 24 min, as reported: the lane is in the Studio and silent. */
  const { t, v } = timelineOf([
    clip({
      clipId: 'LP-1', traccia: 'VOX_C_SUSSURRO', tipo: 'voice', startS: 0, endS: 600,
      tipoContenuto: 'loop', modalita: 'sussurrato', setAffermazioni: 'REF-02',
      setRange: { prefix: 'REF', from: 2, to: 2, ids: [] },
    }),
  ], [aff('REF-01', 'respira... lascia andare')])
  const seed = plainToStudioTracks(t, v)
  assert(seed.tracks[0].clips.length === 0, 'an affirmation the sheet does not carry places nothing (the reported symptom)')
  assert(seed.notes.some((n) => n.startsWith('⚠') && /VOX_C_SUSSURRO/.test(n)),
    'a lane with no clips is now the loudest line in the notes')
}

{
  /* The whisper-ostinato it was supposed to be. */
  const { t, v } = timelineOf([
    clip({
      clipId: 'LP-1', traccia: 'VOX_C_SUSSURRO', tipo: 'voice', startS: 0, endS: 300,
      tipoContenuto: 'loop', modalita: 'sussurrato', setAffermazioni: 'REF-01',
      setRange: { prefix: 'REF', from: 1, to: 1, ids: ['REF-01'] },
    }),
  ], [aff('REF-01', 'respira... lascia andare... sei al sicuro')])
  const seed = plainToStudioTracks(t, v)
  assert(seed.tracks[0].clips.length > 10, 'a resolvable REF still expands into the whisper ostinato')
  assert(seed.tracks[0].duck === 'whisper', 'and keeps its sidechain under the main voice')
}

/* ------------------------------------- the columns, read out of a workbook */

async function fromWorkbook() {
  const X = await import('xlsx')
  const header = [
    'clip_id', 'traccia', 'tipo', 'fase', 'start_s', 'end_s', 'volume_db',
    'tipo_contenuto', 'testo', 'set_affermazioni', 'sequenza', 'intervallo_s',
    'modalita', 'ambiente', 'fx',
  ]
  const rows: unknown[][] = [
    header,
    ['SS-1', 'Soundscape', 'Soundscape', '1', 0, 300, -6, '', '', '', '', '', '', 'lago', 'riverbero(coda=3s, mix=20%)'],
    ['VC-1', 'VOX_A', 'Voice', '1', 5, 25, 0, 'linea', 'Respira.', '', '', '', 'normale', '', 'eco(ritardo=0.8, mix=35%) + coro(voci=4)'],
    ['LP-1', 'VOX_C_SUSSURRO', 'Voice', '2', 60, 280, -12, 'loop', '', '', 'CSI-01@0; CSI-02@40; CSI-03@1:20', '', 'sussurrato', '', ''],
    ['VC-9', 'VOX_B', 'Voice', '3', 30, 50, 0, 'linea', 'Ancora.', '', '', '', 'normale', '', 'vocoder'],
  ]
  const affRows: unknown[][] = [
    ['ID', 'testo', 'set', 'durata_s'],
    ['CSI-01', 'Sono al sicuro.', 'Deep', 4],
    ['CSI-02', 'Posso lasciare andare.', 'Deep', 4],
    ['CSI-03', 'Il mio corpo si calma.', 'Deep', 4],
  ]
  const book = (clipRows: unknown[][]) => {
    const wb = X.utils.book_new()
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['GOOD LOOP - GL-ANX 1.1'], ['Calma e Sicurezza Interiore']]), 'README')
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(clipRows), 'Deep')
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(affRows), 'Affermazioni')
    return X.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  }

  const { parsePlainTimeline } = await import('../src/admin/plainTimeline')
  const res = await parsePlainTimeline(book(rows))
  if (res.error || !res.timeline) { console.error('PARSE ERROR:', res.error); process.exit(1) }
  const t = res.timeline
  const v = t.versions[0]
  const by = (id: string) => v.clips.find((c) => c.clipId === id)!

  assert(by('SS-1').fx?.[0].kind === 'reverb', 'the fx column is read off a Soundscape row')
  assert(by('VC-1').fx?.map((f) => f.kind).join('|') === 'echo|harmonizer', 'two effects in one cell survive the parser')
  assert(close(by('VC-1').fx![0].params.delaySec, 0.8), 'and so do their parameters')
  assert(t.issues.some((i) => i.clipId === 'VC-9' && i.level === 'warning' && /sconosciuto/.test(i.message)),
    'an unreadable fx cell is an import issue, not a crash')

  assert(by('LP-1').sequenzaSteps?.length === 3, 'the sequenza column resolves against the Affermazioni sheet')
  assert(by('LP-1').sequenzaSteps!.map((x) => x.offsetS).join('|') === '0|40|80', 'seconds and m:ss both parse')
  assert(!t.issues.some((i) => /expanded only at seeding/.test(i.message)), 'the "not expanded" apology is gone')

  const seed = plainToStudioTracks(t, v)
  const whisper = seed.tracks.find((x) => x.name.startsWith('VOX_C_SUSSURRO'))!
  assert(whisper.clips.length === 3, 'and the whisper lane finally has clips on it')
  assert(seed.tracks.find((x) => x.name === 'Soundscape')!.effects!.find((e) => e.kind === 'reverb')!.enabled,
    'the workbook reverb reaches the Studio lane')

  /* A loop the sheet cannot resolve must be an ERROR, not a quiet lane. */
  const broken = rows.map((r) => [...r])
  broken[3] = ['LP-1', 'VOX_C_SUSSURRO', 'Voice', '2', 60, 280, -12, 'loop', '', 'REF-09', '', 20, 'sussurrato', '', '']
  const res2 = await parsePlainTimeline(book(broken))
  assert(res2.timeline!.issues.some((i) => i.level === 'error' && /resterebbe muta/.test(i.message)),
    'a loop that resolves to nothing blocks the import instead of shipping a silent track')
}

void fromWorkbook().then(() => {
  if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
  console.log(`\nALL PASS ${pass} assertions`)
})
