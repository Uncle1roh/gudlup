import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataProvider } from '../data/provider'
import type { Nr1Report } from './types'

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
    fnRef.current().then((data) => active && setState({ data, loading: false })).catch((error: Error) => active && setState({ loading: false, error }))
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => load(), [load])
  return { ...state, refetch: load }
}

export function useNr1Report() {
  const dp = useDataProvider()
  return useAsync<Nr1Report>(() => dp.getPsychosocialAggregates(), [dp])
}
