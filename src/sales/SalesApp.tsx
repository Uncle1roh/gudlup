/* ============================================================================
   The commercial console — the BUSINESS

   Everything here used to be in the admin console, in a menu of nineteen
   sections that also held the protocol importer, the audio library and the
   audit log. Two teams were using one back-office: the content team, who
   publish protocols, and the commercial team, who sell to companies and
   negotiate with partners. Neither needed most of what the other saw, and
   one of them was two clicks from changing a company's points multiplier
   while looking for an Excel importer.

   So the menu split. The screens did NOT: `Companies`, `Plans`,
   `Challenges`, `ChallengeTemplates` and `Benefits` are the same components
   that were in the admin console, imported from where they already live.
   Nothing was copied — a second copy of a 423-line challenge editor would
   have been the same screen in two places by the end of the quarter.

   WHAT A COMMERCIAL ACCOUNT MAY SEE

   The role is `sales`, and it is NOT an admin. It carries no permission over
   the catalogue, the audio, the credential queue, the feature switches or
   the audit log, and — this is the one that matters — none over anything
   clinical. `supabase/16-sales-role.sql` writes that into the database
   rather than into this menu: a console is a convenience, and the row
   policies are the actual answer to "what can this account read".

   Campaigns and partners are here because that is who runs them. A challenge
   is a commercial incentive inside the app, and a benefit is a deal somebody
   negotiated and knows the value of. What stays in admin is the economy's
   own RULES — what a Loop is worth, what a traguardo costs — because that is
   the product, not a campaign.
   ============================================================================ */

import { useState } from 'react'
import { useAuth } from '../auth/auth'
import { ConsoleShell, type ConsoleNavItem } from '../admin/ConsoleShell'
import { Companies } from '../admin/Companies'
import { Plans } from '../admin/Plans'
import { Challenges } from '../admin/Challenges'
import { ChallengeTemplates } from '../admin/ChallengeTemplates'
import { Benefits } from '../admin/Benefits'

type Section = 'companies' | 'plans' | 'challenges' | 'templates' | 'benefits'

const NAV: ConsoleNavItem<Section>[] = [
  { id: 'companies', label: 'Aziende', icon: '◭' },
  { id: 'plans', label: 'Piani e moltiplicatori', icon: '×' },
  { id: 'challenges', label: 'Campagne', icon: '⚑' },
  { id: 'templates', label: 'Modelli di campagna', icon: '⚐' },
  { id: 'benefits', label: 'Benefici e partner', icon: '❖' },
]

export function SalesApp() {
  const { user } = useAuth()
  const actor = user?.email ?? 'commerciale@goodloop.app'
  const [section, setSection] = useState<Section>('companies')
  const [navOpen, setNavOpen] = useState(false)

  function pick(id: Section) {
    setSection(id)
    setNavOpen(false)
    window.scrollTo({ top: 0 })
  }

  return (
    <ConsoleShell
      subtitle="commerciale"
      nav={NAV}
      section={section}
      onPick={pick}
      actor={actor}
      /* The three surfaces a demo is given on, and not the admin console:
         showing a prospect the product does not mean showing them the
         protocol importer. */
      preview={['app', 'therapist', 'company']}
      navOpen={navOpen}
      setNavOpen={setNavOpen}
    >
      {section === 'companies' && <Companies actor={actor} />}
      {section === 'plans' && <Plans actor={actor} />}
      {section === 'challenges' && <Challenges actor={actor} />}
      {section === 'templates' && <ChallengeTemplates actor={actor} />}
      {section === 'benefits' && <Benefits actor={actor} />}
    </ConsoleShell>
  )
}
