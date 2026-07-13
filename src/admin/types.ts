/* ============================================================================
   Good Loop — Admin console domain types
   The back-office model: companies (tenants) the platform is rolled out to,
   the users within them, the therapist credential-approval queue, and an
   append-only audit trail of admin actions. These are consumed by the admin
   panel and resolved through the DataProvider (mock today, Supabase when
   provisioned — see docs/DATA_MODEL.sql).
   ============================================================================ */

/** Platform roles. Superset of the auth Role — 'hr_admin' is the company-side
    NR-1 dashboard viewer (built in a later step); 'admin' is platform staff. */
export type UserRole = 'admin' | 'therapist' | 'hr_admin' | 'b2c_user'

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrator',
  therapist: 'Therapist',
  hr_admin: 'HR / company admin',
  b2c_user: 'Employee (self-use)',
}

/** A company the platform is deployed to (the corporate-wellbeing tenant). */
export interface Company {
  id: string
  name: string
  /** Seats purchased in the rollout. */
  seats: number
  /** Employees currently provisioned. */
  activeUsers: number
  status: 'active' | 'paused'
  createdAt: number
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: UserRole
  /** The company this user belongs to (undefined for platform staff). */
  companyId?: string
  active: boolean
  createdAt: number
}

export type CredentialDecision = 'approved' | 'rejected' | 'more_info'
export type CredentialStatus = 'pending' | CredentialDecision

/** A therapist awaiting credential review (CRP/CFP), per the 48h SLA. */
export interface CredentialRequest {
  id: string
  name: string
  email: string
  crp: string
  submittedAt: number
  status: CredentialStatus
  /** Reviewer reason on reject / request-more. */
  reason?: string
  decidedAt?: number
}

/** One entry in the immutable admin audit trail. */
export interface AuditEvent {
  id: string
  at: number
  actor: string
  action: string
  target?: string
  detail?: string
}
