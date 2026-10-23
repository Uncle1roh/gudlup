/* ============================================================================
   The admin console — the PRODUCT

   The catalogue, the audio, the rails, the credential queue, the economy's
   own rules, the tags, the switches, the audit log. What the content and
   operations team works on.

   What left, and where it went: the companies, the add-on plans, the
   challenges, the challenge templates and the benefits are now the
   commercial console (`src/sales/SalesApp.tsx`). They are the same screens,
   unchanged and not copied — only listed in a different menu. A salesperson
   negotiating a partner should not be looking at "Importa protocollo", and
   the person importing a protocol should not be two clicks from changing
   what a company's multiplier is.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth'
import { hydrateTtsSettings } from '../tts/settings'
import { ConsoleShell, type ConsoleNavItem } from './ConsoleShell'
import { Overview } from './Overview'
import { CatalogAdmin } from './CatalogAdmin'
import { AssetLibrary } from './AssetLibrary'
import { CredentialQueue } from './CredentialQueue'
import { ExploreRails } from './ExploreRails'
import { PromoCodes } from './PromoCodes'
import { Tags } from './Tags'
import { Achievements } from './Achievements'
import { GamReports } from './GamReports'
import { Users } from './Users'
import { FeatureSwitches } from './FeatureSwitches'
import { AuditLog } from './AuditLog'
import { Economy } from './Economy'
import { Compliance } from './Compliance'

type Section = 'overview' | 'catalog' | 'rails' | 'assets' | 'credentials' | 'promo' | 'tags' | 'users' | 'compliance' | 'switches' | 'audit' | 'economy' | 'achievements' | 'gamreports'

const NAV: ConsoleNavItem<Section>[] = [
  { id: 'overview', label: 'Panoramica', icon: '▦' },
  { id: 'catalog', label: 'Catalogo contenuti', icon: '♪' },
  { id: 'rails', label: 'Scaffali della libreria', icon: '▤' },
  { id: 'assets', label: 'Libreria audio', icon: '♫' },
  { id: 'credentials', label: 'Credenziali', icon: '✓' },
  { id: 'promo', label: 'Codici promo', icon: '%' },
  /* The economy's RULES stay here — what a Loop is worth, and what a
     traguardo takes — while the campaigns that spend them are commercial. */
  { id: 'economy', label: 'Economia', icon: '∞' },
  { id: 'achievements', label: 'Traguardi', icon: '◎' },
  { id: 'tags', label: 'Tag', icon: '#' },
  { id: 'gamreports', label: 'Report', icon: '▥' },
  { id: 'users', label: 'Utenti e ruoli', icon: '◑' },
  { id: 'compliance', label: 'Conformità', icon: '§' },
  { id: 'switches', label: 'Interruttori', icon: '⏻' },
  { id: 'audit', label: 'Registro attività', icon: '≣' },
]

export function AdminApp() {
  const { user } = useAuth()
  const actor = user?.email ?? 'admin@goodloop.app'
  const [section, setSection] = useState<Section>('overview')
  /* On a phone the sidebar folds into a bar at the top: the menu opens over
     the page and closes again once a section is picked. On a desktop the
     toggle is hidden and the sidebar is always open. */
  const [navOpen, setNavOpen] = useState(false)
  function pick(id: Section) {
    setSection(id)
    setNavOpen(false)
    window.scrollTo({ top: 0 })
  }

  /* Pull the shared ElevenLabs key the moment the console opens.
     The Voice engine panel does this too, but it only MOUNTS when someone
     opens Dettagli — so an operator on a new machine who went straight to
     Pubblica was told there was no key while the key sat in the database
     unread. Publishing is the thing that needs it; the console is where
     publishing happens; so the console is where it is fetched. */
  useEffect(() => { void hydrateTtsSettings() }, [])

  return (
    <ConsoleShell
      subtitle="admin"
      nav={NAV}
      section={section}
      onPick={pick}
      actor={actor}
      preview={['app', 'therapist', 'company']}
      navOpen={navOpen}
      setNavOpen={setNavOpen}
    >
      {section === 'overview' && <Overview onGo={pick} />}
      {section === 'catalog' && <CatalogAdmin actor={actor} />}
      {section === 'rails' && <ExploreRails actor={actor} />}
      {section === 'assets' && <AssetLibrary actor={actor} />}
      {section === 'credentials' && <CredentialQueue actor={actor} />}
      {section === 'promo' && <PromoCodes actor={actor} />}
      {section === 'tags' && <Tags actor={actor} />}
      {section === 'users' && <Users actor={actor} />}
      {section === 'compliance' && <Compliance actor={actor} />}
      {section === 'switches' && <FeatureSwitches actor={actor} />}
      {section === 'audit' && <AuditLog />}
      {section === 'economy' && <Economy actor={actor} />}
      {section === 'achievements' && <Achievements actor={actor} />}
      {section === 'gamreports' && <GamReports />}
    </ConsoleShell>
  )
}
