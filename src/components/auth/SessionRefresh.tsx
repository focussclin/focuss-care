'use client'

import { useEffect } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Mantem o cookie SSR atualizado sem depender do proxy Node do Next.
 *
 * O Next 16 executa `proxy.ts` no runtime Node, que nao e aceito pelo
 * adaptador Cloudflare Workers. O cliente Supabase continua sendo a fonte de
 * renovacao automatica no navegador; as paginas privadas fazem a validacao
 * definitiva no servidor antes de renderizar dados.
 */
export function SessionRefresh() {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return

    void supabase.auth.getSession()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => undefined)

    return () => subscription.unsubscribe()
  }, [])

  return null
}
