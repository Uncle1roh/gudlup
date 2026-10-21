/* ============================================================================
   What each achievement is called, what it asks, and what the unlock sheet
   says — as i18n keys. English is the key (src/i18n/index.tsx falls back to
   it); pt-BR is authoritative and lives in src/i18n/gamification.ts with
   the Italian.

   The unlock line is one warm sentence about the time the person gave
   themselves (SPEC §3.4). It never praises a result, never counts back at
   them, and never implies anything could be lost (GAM-R1, GAM-R2).
   ============================================================================ */

import type { AchievementMetric } from './achievements'

export interface AchievementCopy {
  name: string
  rule: string
  unlocked: string
}

export const ACHIEVEMENT_COPY: Record<string, AchievementCopy> = {
  first_loop: {
    name: 'First Loop',
    rule: 'Complete your first session.',
    unlocked: 'You completed your first session. What a good thing to give yourself this time.',
  },
  stereo_ready: {
    name: 'Headphones ready',
    rule: 'Pass the stereo check and complete a session with headphones.',
    unlocked: 'You set up your headphones and listened all the way through. The sound was made for exactly this.',
  },
  know_yourself: {
    name: 'Knowing yourself',
    rule: 'Complete the initial self-assessment.',
    unlocked: 'You took a moment to look at how you are. That moment is yours.',
  },
  listen_1h: {
    name: 'Listening hours I',
    rule: 'Listen for 1 hour in total.',
    unlocked: 'One hour of listening, given to yourself. It adds up, a little at a time.',
  },
  listen_5h: {
    name: 'Listening hours II',
    rule: 'Listen for 5 hours in total.',
    unlocked: 'Five hours of care that were yours alone. Good to have you here.',
  },
  listen_20h: {
    name: 'Listening hours III',
    rule: 'Listen for 20 hours in total.',
    unlocked: 'Twenty hours of listening. Taking care of yourself has become part of your time.',
  },
  listen_50h: {
    name: 'Listening hours IV',
    rule: 'Listen for 50 hours in total.',
    unlocked: 'Fifty hours given to your own mind. That is a lot of care.',
  },
  deep_dive: {
    name: 'Deep dive',
    rule: 'Complete one Deep session (24 min).',
    unlocked: 'You completed your first 24-minute Deep session. How good to have given that time to yourself.',
  },
  explorer: {
    name: 'Explorer',
    rule: 'Complete a Quick, a Standard and a Deep session at least once each.',
    unlocked: 'Six, twelve and twenty-four minutes — you have tried every length. Now you know what fits your day.',
  },
  own_rhythm: {
    name: 'Your own rhythm',
    rule: 'Listen in 4 different weeks — any weeks, they do not need to be in a row.',
    unlocked: 'Four different weeks with time for you, at your own pace.',
  },
  serene_nights: {
    name: 'Serene nights',
    rule: 'Complete 5 sessions started after 21:00.',
    unlocked: 'Five evenings that ended with a moment of calm. Sleep well.',
  },
  work_pause: {
    name: 'A pause in the workday',
    rule: 'Complete 5 sessions on weekdays between 12:00 and 14:00.',
    unlocked: 'Five pauses in the middle of the day. A break that is really a break.',
  },
  month1_done: {
    name: 'First pathway complete',
    rule: 'Finish a pathway from beginning to end.',
    unlocked: 'You walked a whole pathway, week by week. That was your time, well kept.',
  },
  journey_done: {
    name: 'Journey complete',
    rule: 'Finish the 12-week journey.',
    unlocked: 'Twelve weeks of taking care of yourself. Thank you for staying with you.',
  },
  first_challenge: {
    name: 'First challenge',
    rule: 'Complete a challenge — a Good Loop one or your company’s.',
    unlocked: 'You completed your first challenge, at your own pace.',
  },
  challenger: {
    name: 'Challenger',
    rule: 'Complete 5 challenges.',
    unlocked: 'Five challenges completed. Each one was time for you.',
  },
  city_in_loop: {
    name: 'City in Loop',
    rule: 'Your city reaches its month of care together.',
    unlocked: 'Your city took care of itself together this month — and you were part of it.',
  },
  calm_capital: {
    name: 'Capital of calm',
    rule: 'Your city is the one where each person listened most this month.',
    unlocked: 'Your city was where people gave themselves the most time this month. You were part of it.',
  },
  collective_nights: {
    name: 'Collective serene night',
    rule: 'Your city reaches 1,000 evening sessions in a month.',
    unlocked: 'A thousand calm evenings in your city this month, yours among them.',
  },
  state_in_tune: {
    name: 'State in tune',
    rule: '20 cities in your state with people listening in the same month.',
    unlocked: 'Twenty cities in your state took time for themselves this month. You were part of it.',
  },
  region_in_loop: {
    name: 'Region in Loop',
    rule: 'Your region reaches its month of care together.',
    unlocked: 'Your region reached its month of care together — and you were part of it.',
  },
  brazil_in_loop: {
    name: 'Brazil in Loop',
    rule: 'One million hours of listening across the country.',
    unlocked: 'One million hours of care across Brazil. Some of them are yours.',
  },
  company_in_loop: {
    name: 'Company in Loop',
    rule: '60% of your company takes at least one session in a month.',
    unlocked: 'Most of your company took time for themselves this month — you among them.',
  },
  company_in_tune: {
    name: 'Company in tune',
    rule: 'The whole company completes a company challenge together.',
    unlocked: 'The whole company reached its challenge together. You were part of it.',
  },
}

export function copyFor(slug: string): AchievementCopy {
  return ACHIEVEMENT_COPY[slug] ?? { name: slug, rule: '', unlocked: '' }
}

/** Tier names. "Tier", never "nível" (PLAN A6). */
export const TIER_LABEL: Record<string, string> = {
  semente: 'Seed', broto: 'Sprout', raiz: 'Root', copa: 'Canopy',
  coletiva: 'Collective', nacional: 'National', empresa: 'Company',
}

/** How far along a locked achievement is, in words — time, sessions or
    weeks, never points (PLAN A6). Returns i18n keys with their values. */
export function progressKey(metric: AchievementMetric): { of: string; left: string } {
  switch (metric) {
    case 'minutes_listened':
      return { of: '{value} of {goal}', left: '{left} to go' }
    case 'distinct_weeks':
      return { of: '{value} of {goal} weeks', left: '{left} to go' }
    case 'durations_completed':
      return { of: '{value} of {goal} lengths', left: '{left} to go' }
    case 'pathways_completed':
      return { of: '{value} of {goal} pathways', left: '{left} to go' }
    case 'challenges_completed':
      return { of: '{value} of {goal} challenges', left: '{left} to go' }
    default:
      return { of: '{value} of {goal} sessions', left: '{left} to go' }
  }
}
