import { useAuth, SignOutButton } from '../auth/auth'
import { AvatarUpload } from '../components/AvatarUpload'
import { Nr1Dashboard } from './Nr1Dashboard'
import { useI18n } from '../i18n'
import { BrandLogo } from '../components/Brand'

export function EmployerApp() {
  const { user } = useAuth()
  const { t } = useI18n()
  return (
    <div className="emp-app">
      <header className="emp-topbar">
        <div className="emp-brand">
          <BrandLogo />
          <span className="emp-brand__sub">{t('for employers')}</span>
        </div>
        <div className="emp-topbar__right">
          <AvatarUpload size={32} fallback="🏢" className="avatarup--bar" />
          <span className="b2b-sub">{user?.email ?? 'HR'}</span>
          <SignOutButton className="b2b-btn b2b-btn--signout" />
        </div>
      </header>
      <Nr1Dashboard />
    </div>
  )
}
