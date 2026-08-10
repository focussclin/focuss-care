'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toPatientPortalFailure } from '../application/patientPortalFailure'
import { patientPortalRepositoryFor } from '../infrastructure/repository'
import {
  patientPortalMessages,
  portalTokenSchema,
} from '../schemas/patientPortal.schema'

/**
 * Aceita o convite e cria o vínculo — feature **Portal do paciente**.
 *
 * # Por que esta action NÃO passa por `createAction`
 *
 * `createAction` resolve a clínica ativa por `current_clinic_id()` e recusa quem
 * não a tem. **Todo paciente é exatamente esse caso**: sessão autenticada, zero
 * linhas em `memberships`. Passar por ali devolveria `no-active-clinic` para o
 * fluxo inteiro, sempre.
 *
 * É a mesma exceção documentada de `signIn`, `signUp` e `updatePassword`: são
 * ações de identidade que rodam ANTES de existir vínculo. E, como elas, esta
 * faz manualmente o que o pipeline faria — valida a entrada com Zod e confirma
 * a sessão com `getUser()`, que checa o token no servidor de auth em vez de
 * confiar no cookie.
 *
 * # A autorização real está no banco
 *
 * `accept_patient_portal_invite` exige, na mesma transação: token que bate com
 * um convite `pending`, dentro da validade, e **e-mail da sessão igual ao do
 * convite**. Esta camada não decide nada disso — ela não teria como: o e-mail
 * confiável é o que o Supabase Auth confirmou, e quem o lê é o `auth.jwt()` de
 * lá.
 *
 * Se esta função fosse a única barreira, bastaria chamar a RPC direto pelo
 * PostgREST para contorná-la.
 */
export async function acceptPortalInviteAction(
  rawToken: unknown,
): Promise<ActionResult<{ accountId: string }, 'token'>> {
  const parsed = portalTokenSchema.safeParse(rawToken)

  if (!parsed.success) {
    return err('validation', patientPortalMessages.inviteNotFound)
  }

  const supabase = await createSupabaseServerClient()

  if (!supabase) {
    return err('unavailable', patientPortalMessages.unavailable)
  }

  /*
   * `getUser()`, e não `getSession()`.
   *
   * O segundo lê o cookie; o primeiro valida o token no servidor de auth. Numa
   * decisão que cria vínculo permanente entre uma conta e o prontuário de
   * alguém, a diferença não é acadêmica.
   */
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return err('unauthenticated', patientPortalMessages.notAuthenticated)
  }

  try {
    const accountId = await patientPortalRepositoryFor(supabase).acceptInvite(
      parsed.data,
    )

    return ok({ accountId })
  } catch (cause) {
    return toPatientPortalFailure<'token'>('patientPortalInvite.accept', cause)
  }
}
