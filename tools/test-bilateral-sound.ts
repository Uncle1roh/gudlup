/* Node proof for the bilateral pulse library (the PO files replacing the
   synthesized timbres):
     §1 every catalog entry points at a file that really ships in public/
     §2 a PLAIN row resolves to the right sound (timbro cell → Hz tier → default)
     §3 protocols saved with the old synth timbres still open on a real sound
   Run:
     node_modules/.bin/esbuild tools/test-bilateral-sound.ts --bundle --platform=node \
       --outfile=$TEMP/tbs.cjs && node $TEMP/tbs.cjs
*/
import { existsSync } from 'node:fs'
import { plainToStudioTracks } from '../src/admin/plainStudio'
import { BILATERAL_SOUNDS, DEFAULT_BILATERAL_SOUND, resolveBilateralSound, type BilateralParams } from '../src/studio/multitrack'
import type { PlainClip, PlainTimeline, PlainVersion } from '../src/admin/plainTimeline'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

/* ------------------------------------------------- §1 the files are there */

for (const s of BILATERAL_SOUNDS) {
  assert(existsSync(`public/bilateral/${s.file}`), `${s.id} → public/bilateral/${s.file}`)
}
assert(BILATERAL_SOUNDS.length === 12, `12 PO sounds in the catalog — got ${BILATERAL_SOUNDS.length}`)
assert(new Set(BILATERAL_SOUNDS.map((s) => s.id)).size === BILATERAL_SOUNDS.length, `no duplicate ids`)

/* ------------------------------------------------------- §2 PLAIN mapping */

function bilateralRow(extra: Partial<PlainClip>): BilateralParams {
  const c: PlainClip = {
    clipId: 'BIL-1', traccia: 'BIL-1 Bilaterale', tipo: 'bilateral',
    faseRaw: '4', faseFrom: 4, faseTo: 4, startS: 0, endS: 60, durataS: 60,
    volumeDb: null, volumeLufs: -28, fadeInS: 0, fadeOutS: 0, crossfadePrecS: null,
    intervalloAlternanzaS: 4, panAmpiezza: 80,
    ...extra,
  }
  const v: PlainVersion = {
    sheet: 'Deep', versionKey: 'deep', levelMode: 'lufs', durationS: 60, durationMin: 1,
    clips: [c], tracks: [], phases: [], declaredTotal: null, declaredDurationS: null,
  }
  const t: PlainTimeline = { code: 'GL-TST 1.0', title: 'Test', versions: [v], affirmations: [], issues: [] }
  return plainToStudioTracks(t, v).tracks[0].clips[0].params as BilateralParams
}

assert(bilateralRow({ timbro: 'gong' }).sound === 'gong', `timbro "gong" → gong`)
assert(bilateralRow({ timbro: 'Campana tibetana' }).sound === 'bowl-gong', `timbro "Campana tibetana" → bowl-gong`)
assert(bilateralRow({ timbro: 'whoosh-1' }).sound === 'whoosh-1', `timbro by id → whoosh-1`)
assert(bilateralRow({ frequenzaBlipHz: 250 }).sound === 'zen-deep', `frequenza_blip_hz 250 → zen-deep`)
assert(bilateralRow({ frequenzaBlipHz: 400 }).sound === 'zen-mid', `frequenza_blip_hz 400 → zen-mid`)
assert(bilateralRow({ frequenzaBlipHz: 600 }).sound === 'zen-high', `frequenza_blip_hz 600 → zen-high`)
assert(bilateralRow({}).sound === DEFAULT_BILATERAL_SOUND, `no timbro, no Hz → the default (${DEFAULT_BILATERAL_SOUND})`)
assert(bilateralRow({ timbro: 'triangolo di cristallo' }).sound === DEFAULT_BILATERAL_SOUND, `unknown timbro → the default, not a crash`)
// the sheet's pan_ampiezza still rides through
assert(bilateralRow({}).panAmp === 0.8, `pan_ampiezza 80 → ±0.8`)

/* ------------------------------------------------------- §3 old protocols */

const legacy: [string, string][] = [
  ['blip', 'zen-mid'], ['gong', 'gong'], ['bowl', 'bowl-gong'],
  ['chime', 'zen-high'], ['woodblock', 'bong'], ['drum', 'temple-bell'],
]
for (const [old, want] of legacy) {
  assert(resolveBilateralSound({ timbre: old }).id === want, `saved timbre "${old}" → ${want}`)
}
assert(resolveBilateralSound({}).id === DEFAULT_BILATERAL_SOUND, `a clip with neither field falls back to the default`)
assert(resolveBilateralSound({ sound: 'bowl-low' }).id === 'bowl-low', `an explicit sound always wins`)

if (process.exitCode) { console.error('\nTEST FAILED'); process.exit(1) }
console.log('\nALL PASS')
