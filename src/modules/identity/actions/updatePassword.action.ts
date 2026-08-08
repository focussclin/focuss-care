'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

import {
  newPasswordSchema,
  passwordRecoveryMessages,
  type NewPasswordInput,
} from '../schemas/passwordRecovery.schema'

export interface UpdatePasswordResult {
  ok: boolean
  /** Mensagem pronta para exibicao. Nunca carrega texto do provedor. */
  error?: string
  fieldErrors?: Partial<Record<keyof NewPasswordInput, string>>
  /**
   * A sessao do link nao vale mais (expirou, foi usada, ou o link foi aberto em
   * outro navegador). A tela troca o formulario pelo caminho de pedir outro
   * link — insistir num formulario que nunca vai salvar e cruel.
   */
  sessionExpired?: boolean
}

/**
 * Grava a nova senha — segunda metade de **P-RS**.
 *
 * # Por que Server Action, se o pedido do link e no browser
 *
 * As duas metades tem exigencias diferentes. Pedir o link nao autentica
 * ninguem, precisa de `window.location.origin` para montar o retorno e nao pode
 * revelar nada: e trabalho de cliente. Gravar a senha e escrita autenticada, e
 * a regra do projeto vale inteira — a validacao que conta acontece no servidor,
 * com a sessao lida do cookie e nunca recebida por parametro.
 *
 * Um formulario que chamasse `updateUser` do navegador funcionaria, e deixaria a
 * unica validacao de forca da senha rodando em codigo que o usuario controla.
 *
 * # De onde vem a sessao
 *
 * Do proprio link do e-mail: `/auth/callback` trocou o `code` por sessao antes
 * de mandar a pessoa para ca. Aqui ela e VALIDADA de novo com `getUser()`, que
 * pergunta ao servidor de auth — `getSession()` so le o cookie, e cookie e o que
 * o atacante tem. Sem essa checagem, um cookie forjado chegaria ao
 * `updateUser`.
 *
 * # Por que encerra a sessao no fim
 *
 * Trocar a senha e o momento em que se assume que a anterior vazou. A sessao
 * aberta pelo link continuaria valendo, e quem estivesse com ela seguiria
 * dentro. Encerrar e mandar para o login custa uma digitacao e prova que a nova
 * senha funciona.
 */
export async function updatePasswordAction(
  input: NewPasswordInput,
): Promise<UpdatePasswordResult> {
  const parsed = newPasswordSchema.safeParse(input)

  if (!parsed.success) {
    const fieldErrors: UpdatePasswordResult['fieldErrors'] = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === 'password' || field === 'passwordConfirmation') {
        fieldErrors[field] ??= issue.message
      }
    }

    return {
      ok: false,
      error: passwordRecoveryMessages.updateUnavailable,
      fieldErrors,
    }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { ok: false, error: passwordRecoveryMessages.updateUnavailable }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    return {
      ok: false,
      sessionExpired: true,
      error: passwordRecoveryMessages.linkInvalid,
    }
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })

  if (error) {
    /*
     * So codigo e status vao para o log. A mensagem do provedor pode citar a
     * politica de senha do projeto, e o log e lido por gente que nao precisa
     * saber a senha de ninguem — nem o que ela quase foi.
     */
    console.error('[updatePasswordAction]', {
      code: error.code ?? 'unknown',
      status: error.status ?? null,
    })

    // 401/403: a sessao do link caiu entre abrir a tela e enviar o formulario.
    if (error.status === 401 || error.status === 403) {
      return {
        ok: false,
        sessionExpired: true,
        error: passwordRecoveryMessages.linkInvalid,
      }
    }

    if (error.code === 'same_password') {
      return {
        ok: false,
        error: passwordRecoveryMessages.sameAsPrevious,
        fieldErrors: { password: passwordRecoveryMessages.sameAsPrevious },
      }
    }

    return { ok: false, error: passwordRecoveryMessages.updateUnavailable }
  }

  // Ver o JSDoc: a senha mudou, entao a sessao aberta pelo link acaba aqui.
  await supabase.auth.signOut()

  return { ok: true }
}
