'use server'

import { redirect } from 'next/navigation'

import { safeNextPath } from '@/lib/routes/safeNextPath'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import {
  loginMessages,
  loginSchema,
  type LoginInput,
} from '../schemas/login.schema'

export interface SignInResult {
  ok: boolean
  /** Mensagem pronta para exibicao. Nunca revela se o e-mail existe. */
  error?: string
}

/**
 * Entra com e-mail e senha e leva a pessoa **para onde ela ia**.
 *
 * `requestedNext` chega do navegador, e é por isso que ele não é usado como
 * veio: quem escreve a URL escreveria o destino, e mandar alguém recém-logado
 * para fora do domínio é redirecionamento aberto. `safeNextPath` decide, no
 * servidor, e o pior caso dela é `/dashboard` — que era o único destino possível
 * antes desta correção.
 */
export async function signInAction(
  input: LoginInput,
  requestedNext?: string,
): Promise<SignInResult> {
  const parsed = loginSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: loginMessages.invalidCredentials }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { ok: false, error: loginMessages.unexpected }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) return { ok: false, error: loginMessages.invalidCredentials }

  redirect(safeNextPath(requestedNext))
}
