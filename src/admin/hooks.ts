import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataProvider } from '../data/provider'
import type { CatalogProtocol } from '../data/catalog'
import type { Company, AdminUser, CredentialRequest, AuditEvent } from './types'

interface AsyncState<T> {
  data?: T
  loading: boolean
  error?: Error
  refetch: () => void
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: Error }>({ loading: true })
  const fnRef = useRef(fn)
  fnRef.current = fn

  const load = useCallback(() => {
    let active = true
    setState((s) => ({ ...s, loading: true }))
    fnRef
      .current()
      .then((data) => active && setState({ data, loading: false }))
      .catch((error: Error) => active && setState({ loading: false, error }))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => load(), [load])
  return { ...state, refetch: load }
}

export function useProtocols() {
  const dp = useDataProvider()
  return useAsync<CatalogProtocol[]>(() => dp.listProtocols(), [dp])
}
export function useCompanies() {
  const dp = useDataProvider()
  return useAsync<Company[]>(() => dp.listCompanies(), [dp])
}
export function useAdminUsers() {
  const dp = useDataProvider()
  return useAsync<AdminUser[]>(() => dp.listAdminUsers(), [dp])
}
export function useCredentialRequests() {
  const dp = useDataProvider()
  return useAsync<CredentialRequest[]>(() => dp.listCredentialRequests(), [dp])
}
export function useAuditEvents() {
  const dp = useDataProvider()
  return useAsync<AuditEvent[]>(() => dp.listAuditEvents(), [dp])
}
