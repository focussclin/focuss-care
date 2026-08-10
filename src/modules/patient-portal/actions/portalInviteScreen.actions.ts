'use server'

import { redirect } from 'next/navigation'

import { acceptPortalInviteAction } from './acceptPortalInvite.action'
import { createPortalInviteAction } from './createPortalInvite.action'
import type {
  PortalInviteCreatedDto,
} from '../schemas/patientPortal.schema'

/**
 * Adaptadores entre a tela e as actions.
 *
 * Existem porque componente de cliente não pode receber função de um Server
 * Component (ver `src/app/serverBoundaryProps.test.ts`): o que atravessa a
 * fronteira precisa ser uma referência `'use server'`, e é isto.
 *
 * Eles também traduzem o `Result` para o contrato que as telas deste módulo
 * usam — **mensagem de erro, ou `null` para sucesso** —, que é o mesmo do
 * `ConfirmDialog` e do `PaymentModal`.
 */

/**
 * Aceita o convite e leva ao portal.
 *
 * O `redirect()` fica AQUI, e não dentro de `acceptPortalInviteAction`: o JSDoc
 * de `createAction` avisa que `redirect()` sinaliza por exceção e não pode
 * rodar dentro do handler, e a mesma regra vale para qualquer action que
 * alguém queira compor depois. Mantê-lo na borda deixa a action reutilizável.
 */
export async function acceptInviteFromScreen(
  token: string,
): Promise<string | null> {
  const result = await acceptPortalInviteAction(token)

  if (!result.ok) return result.error.message

  redirect('/portal-paciente')
}

export async function createInviteFromScreen(
  patientId: string,
  email: string,
): Promise<
  { ok: true; invite: PortalInviteCreatedDto } | { ok: false; message: string }
> {
  const result = await createPortalInviteAction({
    patientId,
    email,
    expiresInDays: 7,
  })

  if (!result.ok) return { ok: false, message: result.error.message }

  return {
    ok: true,
    invite: { url: result.data.url, expiresLabel: result.data.expiresLabel },
  }
}
