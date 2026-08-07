'use client'

import { createBrowserClient } from '@supabase/ssr'

import type { Database } from './database.types'
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from './config'

/**
 * Cliente do browser. Usa apenas a chave anonima — o acesso continua limitado
 * pelas policies de RLS.
 *
 * Destinado a Realtime e upload direto para o Storage. Leitura de pagina e
 * mutacao passam por Server Components e Server Actions.
 */
export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null

  return createBrowserClient<Database>(supabaseUrl, supabasePublishableKey)
}
