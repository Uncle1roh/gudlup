/* ============================================================================
   Which column of a PLAIN sheet holds which of the four script variants

   This exists because of one shape of bug. The alias table was written by
   hand, every language had a `_f` spelling for each of its aliases, and only
   the PRIMARY alias had a `_m` one — so a workbook writing `testo_pt-br_m`
   and `testo_pt-br_f` had its FEMALE Portuguese read and its MALE Portuguese
   silently dropped. The import then reported "identico: niente da importare"
   for a file whose Portuguese cells had just been corrected, and the
   correction round was repeated for days.

   Two rules are asserted here, and they are the whole contract:

     · every spelling a bilingual team plausibly types resolves, in BOTH
       forms — never one and not the other;
     · a header that looks like a text column and resolves to nothing is
       REPORTED, because that is the only thing standing between a misnamed
       column and a silent loss.
   ============================================================================ */

import { resolveScriptColumns, unknownColumnIssue } from '../src/admin/plainTimeline'

let failed = 0
let checks = 0

function eq(label: string, got: unknown, want: unknown): void {
  checks++
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) { failed++; console.log(`FAIL  ${label}\n      got  ${a}\n      want ${b}`) }
  else console.log(`ok  : ${label}`)
}

function resolves(header: string, key: string): void {
  const c = resolveScriptColumns(['clip_id', header])
  eq(`"${header}" → ${key}`, c.byVariant[key], header)
  eq(`"${header}" is not reported as unknown`, c.unknown, [])
}

/* ---- the canonical names ------------------------------------------------ */
resolves('testo_it_m', 'it')
resolves('testo_it_f', 'it:f')
resolves('testo_pt_m', 'pt-BR')
resolves('testo_pt_f', 'pt-BR:f')
resolves('testo_en_m', 'en')
resolves('testo_en_f', 'en:f')

/* ---- the bare column every workbook written before the axes uses -------- */
resolves('testo', 'it')
resolves('testo_pt', 'pt-BR')

/* ---- BOTH forms of every alias. This is the regression. ----------------- */
for (const [base, key] of [
  ['it', 'it'], ['ita', 'it'], ['italiano', 'it'],
  ['pt', 'pt-BR'], ['pt-br', 'pt-BR'], ['pt_br', 'pt-BR'], ['ptbr', 'pt-BR'],
  ['br', 'pt-BR'], ['bra', 'pt-BR'], ['portoghese', 'pt-BR'], ['portugues', 'pt-BR'],
  ['en', 'en'], ['eng', 'en'], ['inglese', 'en'],
] as [string, string][]) {
  resolves(`testo_${base}_m`, key)
  resolves(`testo_${base}_f`, `${key}:f`)
  /* and the Portuguese spelling of the prefix, which a Brazilian analyst
     types without thinking about it */
  resolves(`texto_${base}_m`, key)
  resolves(`texto_${base}_f`, `${key}:f`)
}

/* ---- separators, case and accents --------------------------------------- */
resolves('TESTO_PT_M', 'pt-BR')
resolves('Testo PT (M)', 'pt-BR')
resolves('Testo-PT-F', 'pt-BR:f')
resolves('testo.pt.m', 'pt-BR')
resolves('testo_português_feminino', 'pt-BR:f')
resolves('testo_italiano_maschile', 'it')

/* ---- the more specific column wins -------------------------------------- */
{
  const c = resolveScriptColumns(['clip_id', 'testo', 'testo_it_m', 'testo_pt_m'])
  eq('testo_it_m beats a bare testo', c.byVariant.it, 'testo_it_m')
  eq('…and the order it is listed in does not matter',
    resolveScriptColumns(['clip_id', 'testo_it_m', 'testo']).byVariant.it, 'testo_it_m')
}

/* ---- an unreadable text column is NAMED, not swallowed ------------------- */
{
  const c = resolveScriptColumns(['clip_id', 'testo_it_m', 'testo_breve', 'testo_pt_xx'])
  eq('the good ones still resolve', c.byVariant.it, 'testo_it_m')
  eq('the bad ones are collected', c.unknown, ['testo_breve', 'testo_pt_xx'])
  const issue = unknownColumnIssue('Standard', c.unknown)
  eq('there is an issue', !!issue, true)
  eq('it is a warning', issue?.level, 'warning')
  eq('tagged so the import panel can lift it', issue?.code, 'column')
  eq('and it names both columns', issue?.message.includes('testo_breve') && issue?.message.includes('testo_pt_xx'), true)
}

/* ---- a sheet with no text column at all reports nothing ------------------ */
{
  const c = resolveScriptColumns(['clip_id', 'traccia', 'tipo', 'start_s', 'note'])
  eq('no variants', c.byVariant, {})
  eq('nothing to warn about', c.unknown, [])
  eq('no issue', unknownColumnIssue('X', c.unknown), null)
}

console.log(`\n${checks} checks, ${failed} failed`)
process.exit(failed ? 1 : 0)
