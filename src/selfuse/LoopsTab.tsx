/* ============================================================================
   Loops — four doors, not four tabs (POs, 2026-11-03)

   WHAT THIS REPLACES. Two screens that had grown a tab bar each: "Minha
   jornada" carried Resumo / Conquistas / Rankings / Desafios, and
   "Benefícios" carried Available / My benefits — so three of the four things
   a person earns lived behind a segmented control on a screen whose title
   said "journey", and the fourth lived on a screen whose title said
   "benefits". Nothing on either screen said what a Loop was.

   Now: Minha jornada is the statistics screen and nothing else, and this
   screen is where everything a Loop touches lives. It opens on four boxes
   the same size as each other, each saying in one line what it is, and each
   one a door to the page that used to be a tab:

     Conquistas  → `Conquistas`     (was Minha jornada › Conquistas)
     Desafios    → `ChallengesTab`  (was Minha jornada › Desafios)
     Rankings    → `RankingsTab`    (was Minha jornada › Rankings)
     Prêmios     → `BenefitsTab`    (was the Benefícios screen)

   A door, not a tab, for one reason: a tab bar asks you to read four words
   and guess which one holds what you came for. A box has room to say it.

   The subtitle of this screen is `LOOPS_EXPLAINER` — the same text, word for
   word, that the popup on the Loops pill prints (POs' instruction). It is
   one constant in `gamification/copy.ts`; neither place writes its own.
   ============================================================================ */

import { useI18n } from '../i18n'
import { useBackLayer } from './backStack'
import { Conquistas } from './Conquistas'
import { RankingsTab } from './Coletivas'
import { ChallengesTab } from './ChallengesTab'
import { BenefitsTab } from './BenefitsTab'
import { Icon, type IconName } from './icons'
import { TopBar, PageTitle } from '../ui2/TopBar'
import { LOOPS_EXPLAINER } from '../gamification/copy'

/** The hub and the four pages behind it. */
export type LoopsView = 'hub' | 'achievements' | 'challenges' | 'rankings' | 'prizes'

interface LoopsProps {
  /** First name, when the account gives one — the top bar prints it. */
  name: string | null
  /** The person belongs to a company, so an employer's challenge is theirs. */
  hasCompany: boolean
  view: LoopsView
  onView: (v: LoopsView) => void
  /** "Iniciar sessão" from a challenge or a card: back to the library. */
  onStartSession: () => void
}

/* What each door is, in one sentence. Written so that somebody who has never
   opened any of them can tell which one they want — and with no word from
   the §6.5 "never use" column: nothing is sold here, nothing is a level and
   nothing is a score (GAM-R7, PLAN A6). */
const DOORS: { id: Exclude<LoopsView, 'hub'>; icon: IconName; label: string; about: string }[] = [
  {
    id: 'achievements',
    icon: 'flag',
    label: 'Achievements',
    about: 'What stays once it is reached: the time you have given yourself, the lengths you have tried, the pathways you have walked.',
  },
  {
    id: 'challenges',
    icon: 'target',
    label: 'Challenges',
    about: 'Something to take part in for a few days or a month — on your own, with your city, or with your company.',
  },
  {
    id: 'rankings',
    icon: 'globe',
    label: 'Rankings',
    about: 'How your city, your state and your region are taking care of themselves. Places only — never people, never names.',
  },
  {
    id: 'prizes',
    icon: 'partners',
    label: 'Prizes',
    about: 'Care that comes back to you: exchange your Loops for something that looks after your body or your mind.',
  },
]

export function LoopsTab({ name, hasCompany, view, onView, onStartSession }: LoopsProps) {
  const { t } = useI18n()
  /* Back goes to the hub from any of the four, and only then out of the
     screen — the rail's own layer catches that (`SelfUseApp`). */
  useBackLayer(view !== 'hub', () => onView('hub'))

  if (view === 'prizes') {
    return (
      <BenefitsTab
        name={name}
        hasCompany={hasCompany}
        onBack={() => onView('hub')}
        onStartSession={onStartSession}
        onSeeAchievements={() => onView('achievements')}
        onSeeChallenges={() => onView('challenges')}
      />
    )
  }

  if (view !== 'hub') {
    const door = DOORS.find((d) => d.id === view)
    return (
      <>
        <TopBar name={name} />
        <button className="su-back" onClick={() => onView('hub')}>‹ {t('Loops')}</button>
        <PageTitle title={t(door?.label ?? 'Loops')} note={door ? t(door.about) : undefined} />
        {view === 'achievements' && <Conquistas onGoRankings={() => onView('rankings')} />}
        {view === 'challenges' && <ChallengesTab hasCompany={hasCompany} onStartSession={onStartSession} />}
        {view === 'rankings' && <RankingsTab />}
      </>
    )
  }

  return (
    <>
      <TopBar name={name} />
      {/* The definition, in the words the popup uses. */}
      <PageTitle title={t('Loops')} note={t(LOOPS_EXPLAINER)} />

      <div className="g2x2 lp2-doors">
        {DOORS.map((d) => (
          <button key={d.id} type="button" className="glass lp2-card" onClick={() => onView(d.id)}>
            <span className="lp2-card__top">
              <span className="lp2-card__icon" aria-hidden="true"><Icon name={d.icon} size={22} /></span>
              <span className="lp2-card__h">{t(d.label)}</span>
              <span className="lp2-card__go" aria-hidden="true">›</span>
            </span>
            <span className="lp2-card__about">{t(d.about)}</span>
          </button>
        ))}
      </div>
    </>
  )
}
