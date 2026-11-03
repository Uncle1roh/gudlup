/* The gamification screens, rendered — and the rules the SPEC puts on them.

   - every achievement string and every screen string has pt-BR and Italian
   - the unlock sheet and the badges render, in pt-BR, with Loops and time
     only: no "pontos", "pontuação" or "nível" reaches the person (PLAN A6)
   - nothing from gamification is wired into the post-session screen (GAM-R6)

   Run: npm test -- gam-ui                                                   */

import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { FixedLocale } from '../src/i18n'
import { PT_GAMIFICATION, IT_GAMIFICATION } from '../src/i18n/gamification'
import { PT } from '../src/i18n/pt'
import { PT_LEGAL } from '../src/i18n/legal'
import { PT_WORKSPACE } from '../src/i18n/workspace'
import { PT_CORPORATE } from '../src/i18n/corporate'
import { PT_SELFUSE_EXTRA } from '../src/i18n/selfuse-extra'
import { PT_STUDIO } from '../src/i18n/studio'
import { IT_UI2, PT_UI2 } from '../src/i18n/ui2'

/* The pt-BR dictionary as the app merges it (src/i18n/index.tsx). The redesign's
   own sheet is LAST there and last here: the Loops screen's strings live in it. */
const ALL_PT: Record<string, string> = { ...PT, ...PT_LEGAL, ...PT_WORKSPACE, ...PT_CORPORATE, ...PT_SELFUSE_EXTRA, ...PT_STUDIO, ...PT_GAMIFICATION, ...PT_UI2 }
import { ACHIEVEMENT_COPY, LOOPS_EXPLAINER, LOOPS_TITLE, TIER_LABEL } from '../src/gamification/copy'
import { ACHIEVEMENTS, unseenUnlocks } from '../src/gamification/achievements'
import { MockLedger } from '../src/gamification/mockLedger'
import { UnlockSheet } from '../src/selfuse/UnlockSheet'
import { Badge } from '../src/gamification/ui/Badge'

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1 } else console.log(`ok  : ${msg}`)
}

/* ---- translations --------------------------------------------------------- */
const copyKeys = Object.values(ACHIEVEMENT_COPY).flatMap((c) => [c.name, c.rule, c.unlocked])
const missingPt = copyKeys.filter((k) => !PT_GAMIFICATION[k])
const missingIt = copyKeys.filter((k) => !IT_GAMIFICATION[k])
assert(ACHIEVEMENTS.every((a) => ACHIEVEMENT_COPY[a.slug]), 'every achievement has its copy')
assert(!missingPt.length, `every achievement string has pt-BR${missingPt.length ? `: missing ${missingPt.join(' | ')}` : ''}`)
assert(!missingIt.length, `every achievement string has Italian${missingIt.length ? `: missing ${missingIt.join(' | ')}` : ''}`)
assert(Object.values(TIER_LABEL).every((k) => PT_GAMIFICATION[k] && IT_GAMIFICATION[k]), 'tier names translated')
const ptKeys = Object.keys(PT_GAMIFICATION)
const itKeys = new Set(Object.keys(IT_GAMIFICATION))
const onlyPt = ptKeys.filter((k) => !itKeys.has(k))
assert(!onlyPt.length, `pt and it dictionaries carry the same keys${onlyPt.length ? `: only in pt ${onlyPt.join(' | ')}` : ''}`)

/* The screens' literal t('…') keys, read from source, must all be in pt. */
for (const file of ['src/selfuse/Conquistas.tsx', 'src/selfuse/UnlockSheet.tsx', 'src/gamification/copy.ts', 'src/selfuse/Coletivas.tsx', 'src/selfuse/CityPicker.tsx', 'src/selfuse/BenefitsTab.tsx', 'src/selfuse/LoopsTab.tsx', 'src/ui2/LoopsChip.tsx', 'src/selfuse/ChallengeCard.tsx', 'src/selfuse/ChallengeDetail.tsx', 'src/corporate/Addon.tsx']) {
  const src = readFileSync(file, 'utf8')
  const keys = [...src.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1])
    .concat([...src.matchAll(/(?:of|left): '([^']+)'/g)].map((m) => m[1]))
  const missing = keys.filter((k) => !ALL_PT[k])
  assert(!missing.length, `${file}: every screen string has pt-BR${missing.length ? `: missing ${missing.join(' | ')}` : ''}`)
}

/* ---- what a Loop is: one text, two places (POs, 2026-11-03) --------------- */
/* Neither `t(…)` regex above can see these — the screens pass a constant, not
   a literal — so they are named here. `LoopsTab` prints the explainer as the
   screen's subtitle and `LoopsChip` prints it in the popup; a dictionary
   missing it would show English to one of the two and not the other. */
for (const [what, key] of [['title', LOOPS_TITLE], ['explainer', LOOPS_EXPLAINER]] as const) {
  assert(!!PT_UI2[key], `the Loops ${what} has pt-BR`)
  assert(!!IT_UI2[key], `the Loops ${what} has Italian`)
}
{
  const hub = readFileSync('src/selfuse/LoopsTab.tsx', 'utf8')
  const chip = readFileSync('src/ui2/LoopsChip.tsx', 'utf8')
  assert(/note=\{t\(LOOPS_EXPLAINER\)\}/.test(hub), 'the Loops screen prints the shared explainer as its subtitle')
  assert(/t\(LOOPS_EXPLAINER\)/.test(chip), 'the Loops pill prints the same constant in its popup')
  assert(!/A Loop is a minute/.test(hub + chip), 'neither of them writes its own copy of the text')
}

/* ---- PLAN A6: Loops, never points ----------------------------------------- */
const pointsWord = /\bpont(o|os|uação|uacao)\b|\bnível\b|\bnivel\b|\bpunt(o|i|eggio)\b|\blivello\b/i
const leaks = [...Object.values(PT_GAMIFICATION), ...Object.values(IT_GAMIFICATION)].filter((v) => pointsWord.test(v))
assert(!leaks.length, `no person-facing string speaks of points or levels${leaks.length ? `: ${leaks.join(' | ')}` : ''}`)

/* ---- rendering --------------------------------------------------------------- */
const l = new MockLedger()
const t0 = Date.parse('2026-10-20T00:30:00Z')
l.creditSession({ id: 'a', protocolCode: 'X', duration: 24, startedAt: t0, completedAt: t0 + 1_440_000, completed: true, listenedSec: 1440, stereoChecked: true }, t0 + 1_500_000)
const queue = l.achievements().filter((a) => a.unlockedAt !== null)
assert(queue.map((a) => a.slug).join() === 'first_loop,stereo_ready,deep_dive', `a first Deep session with the stereo check unlocks three (${queue.map((a) => a.slug).join()})`)
/* What the app asks for the moment that session ends (POs, 2026-11-03): the
   same three, none of them seen yet, oldest first. This is the whole chain
   behind the popup — credit the session, evaluate, read back what is new. */
{
  const fresh = unseenUnlocks(l.achievements())
  assert(fresh.length === 3, `the end of a session leaves three unlocks unseen (${fresh.length})`)
  assert(fresh.every((a) => a.seenAt === null), 'none of them is marked seen before the sheet is closed')
  l.markSeen(fresh.map((a) => a.id))
  assert(unseenUnlocks(l.achievements()).length === 0, 'closing the sheet empties the queue')
}

const sheet = renderToString(h(FixedLocale, { locale: 'pt-BR' }, h(UnlockSheet, { queue, onSeeAll: () => {}, onClose: () => {} })))
assert(sheet.includes('Conquista desbloqueada'), 'sheet: eyebrow "Conquista desbloqueada"')
assert(sheet.includes('Primeiro Loop'), 'sheet: the first unlock is shown first')
assert(sheet.includes('+20 Loops de bônus'), 'sheet: the bonus pill reads "+20 Loops de bônus"')
assert(sheet.includes('1 de 3'), 'sheet: three unlocks queue into one sheet with a pager')
assert(sheet.includes('Ver minhas conquistas') && sheet.includes('Agora não'), 'sheet: "Ver minhas conquistas" and "Agora não"')
assert(!pointsWord.test(sheet.replace(/<[^>]+>/g, ' ')), 'sheet: no points anywhere')

const circle = renderToString(h(Badge, { icon: 'clock', tier: 'broto', shape: 'circle' }))
const hex = renderToString(h(Badge, { icon: 'pin', tier: 'coletiva', shape: 'hexagon', locked: true }))
assert(circle.includes('<circle') && !circle.includes('<polygon'), 'badge: individual is a circle')
assert(hex.includes('<polygon') && hex.includes('#ECEADB'), 'badge: collective is a hexagon, locked in the greyed fill')
assert(circle.match(/<ellipse/g)?.length === 2, 'badge: two faint orbit ellipses')

/* ---- GAM-R6: the post-session screen ---------------------------------------- */
{
  const session = readFileSync('src/selfuse/Session.tsx', 'utf8')
  assert(!/gamification|UnlockSheet|Badge|Conquistas|getWallet|listMyAchievements/.test(session), 'GAM-R6: the session and post-session screens import nothing from gamification')
  const app = readFileSync('src/selfuse/SelfUseApp.tsx', 'utf8')
  /* It used to be pinned to Home as well. The POs asked for the popup at the
     moment the achievement completes (2026-11-03), and a session launched
     from Percurso or from Terapia returns to that tab — so Home as a
     condition meant "not now, and probably never". What GAM-R6 actually
     forbids is unchanged and still asserted: nothing from gamification on
     the post-session screen, and no sheet while a session is up. */
  assert(/unlockSheetUp = unlocks\.length > 0 && !launch && overlay\.kind === 'none'/.test(app), 'GAM-R6: no unlock sheet while a session or an overlay is up')
  assert(/checkUnlocks\(\)\n  \}/.test(app), 'the achievements are read again when a session ends, so the sheet is not a day late')
}

console.log(process.exitCode ? '\nFAILED' : '\ndone.')
