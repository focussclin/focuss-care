'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Observa uma media query sem quebrar a hidratacao.
 *
 * useSyncExternalStore e usado de proposito: no servidor o snapshot e sempre
 * `false` (mobile-first), e o React reconcilia com o valor real no cliente sem
 * disparar aviso de hydration mismatch.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mediaQueryList = window.matchMedia(query)
      mediaQueryList.addEventListener('change', onStoreChange)
      return () => mediaQueryList.removeEventListener('change', onStoreChange)
    },
    [query],
  )

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  )

  const getServerSnapshot = useCallback(() => false, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
