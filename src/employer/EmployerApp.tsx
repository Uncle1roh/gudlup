import { useAuth, SignOutButton } from '../auth/auth'
import { Nr1Dashboard } from './Nr1Dashboard'
import { useI18n } from '../i18n'

export function EmployerApp() {
  const { user } = useAuth()
  const { t } = useI18n()
  return (
    <div className="emp-app">
      <header className="emp-topbar">
        <div className="emp-brand">
          <span className="emp-brand__mark">◠◡</span>
          <span className="emp-brand__name">goodloop <span className="emp-brand__sub">{t('for employers')}</span></span>
        </div>
        <div className="emp-topbar__right">
          <span className="b2b-sub">{user?.email ?? 'HR'}</span>
          <SignOutButton className="b2b-btn b2b-btn--signout" />
        </div>
      </header>
      <Nr1Dashboard />
    </div>
  )
}
