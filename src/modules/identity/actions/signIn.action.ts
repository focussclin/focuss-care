'use server'

import { redirect } from 'next/navigation'

import { safeNextPath } from '@/lib/routes/safeNextPath'
import {
  checkLoginThrottle,
  clearLoginThrottle,
  registerLoginFailure,
} from '@/lib/security/login-throttle'
import { requiresSecondFactor } from '@/lib/security/mfa'
import { retryAfterSeconds } from '@/lib/security/rate-limit'
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

  /*
   * Controle de taxa ANTES de falar com o Supabase.
   *
   * Depois seria tarde: a tentativa já teria custado uma ida ao provedor de
   * autenticação, que é justamente o recurso que a força bruta consome. Ver a
   * limitação declarada em `login-throttle.ts` — o armazenamento é por
   * processo.
   */
  const throttle = await checkLoginThrottle(parsed.data.email)
  if (!throttle.allowed) {
    return {
      ok: false,
      error: loginMessages.tooManyAttempts(retryAfterSeconds(throttle.retryAfterMs)),
    }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { ok: false, error: loginMessages.unexpected }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    await registerLoginFailure(parsed.data.email)
    return { ok: false, error: loginMessages.invalidCredentials }
  }

  /*
   * Acertou: o contador some. Sem isto, quem errou quatro vezes e acertou na
   * quinta carregaria o backoff para a proxima sessao — punindo quem ja provou
   * ser dono da conta.
   */
  await clearLoginThrottle(parsed.data.email)

  /*
   * Segundo fator — feature S-MFA.
   *
   * A senha certa deixa a sessao em `aal1`. Se a conta tem fator cadastrado, o
   * provedor sobe `nextLevel` para `aal2`, e a sessao so vale de fato depois do
   * codigo. Sem este desvio, cadastrar um fator seria seguranca FALSA: a pessoa
   * veria "verificacao em duas etapas ativa" e entraria so com a senha.
   *
   * O destino pedido viaja junto: quem clicou num link de convite continua indo
   * para la depois do codigo. `safeNextPath` decide o valor no servidor, entao o
   * que atravessa aqui ja e um caminho interno.
   */
  const { data: assurance } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  if (requiresSecondFactor(assurance ?? { currentLevel: null, nextLevel: null })) {
    const next = safeNextPath(requestedNext)
    redirect(`/verificacao?next=${encodeURIComponent(next)}`)
  }

  redirect(safeNextPath(requestedNext))
}
