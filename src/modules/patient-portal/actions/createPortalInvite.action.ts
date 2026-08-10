'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { formatShortDate } from '@/lib/utils/date'
import { getApplicationOrigin } from '@/lib/urls/applicationOrigin'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toPatientPortalFailure } from '../application/patientPortalFailure'
import { patientPortalRepositoryFor } from '../infrastructure/repository'
import {
  createPortalInviteSchema,
  patientPortalMessages,
  type CreatePortalInviteInput,
  type PortalInviteCreatedDto,
} from '../schemas/patientPortal.schema'

type Field = 'patientId' | 'email' | 'expiresInDays'

/**
 * Gera o convite de portal para um paciente — feature **Portal do paciente**.
 *
 * # O token aparece uma vez
 *
 * A função do banco devolve o token em claro e grava apenas o sha256. Esta
 * action monta a URL, devolve para a tela copiar, e **não a guarda em lugar
 * nenhum**. Quem não copiar precisa de um convite novo.
 *
 * Isso é a garantia, não o inconveniente: um token recuperável do banco seria um
 * token que qualquer membro com leitura consegue usar para virar o paciente.
 *
 * # O que a auditoria registra, e o que ela não pode registrar
 *
 * Registra o paciente e o fato de o convite ter sido emitido. **Não registra o
 * token nem o e-mail**: o token é credencial, e a trilha de auditoria é lida por
 * mais gente do que quem emitiu. O e-mail fica na própria linha do convite, onde
 * quem tem `patient.write` já o alcança.
 */
const runCreatePortalInvite = createAction<
  CreatePortalInviteInput,
  PortalInviteCreatedDto & { patientId: string },
  Field
>({
  name: 'patientPortalInvite.create',
  schema: createPortalInviteSchema,
  /*
   * Mesma lista de `patient.write`: quem edita o cadastro do paciente pode dar
   * acesso a ele. `finance` fica de fora — cobrar não é motivo para conceder
   * acesso a consultas.
   *
   * A função do banco repete esta checagem com `has_clinic_role`. As duas
   * existem porque protegem coisas diferentes: esta recusa cedo e com mensagem
   * boa; a de lá vale também para quem chamar o PostgREST direto.
   */
  roles: rolesWith('patient.write'),
  messages: {
    forbidden: patientPortalMessages.forbidden,
    validation: patientPortalMessages.invalidFields,
    unavailable: patientPortalMessages.unavailable,
    unexpected: patientPortalMessages.unexpected,
  },
  /*
   * A ficha do paciente, e NÃO a listagem.
   *
   * O painel de portal vive em `/pacientes/[patientId]`; `/pacientes` não mostra
   * convite nenhum. Revalidar a listagem jogaria fora cache alheio a cada
   * convite emitido, e ainda deixaria a ficha desatualizada — errado nas duas
   * pontas. `revalidateTargets.test.ts` pegou exatamente isso.
   *
   * Caminho literal por `patientPaths`, e não o padrão `[patientId]`: o segundo
   * invalidaria a ficha de TODOS os pacientes da instalação.
   *
   * O id sai do `output`, e não do `input`: o callback não recebe a entrada de
   * propósito — se recebesse, o navegador escolheria qual rota expirar.
   */
  revalidatePaths: (_scope, output) => patientPaths(output.patientId),
  handler: async (input, context) => {
    try {
      const invite = await patientPortalRepositoryFor(context.supabase).createInvite(
        input.patientId,
        input.email,
        input.expiresInDays,
      )

      /*
       * A origem sai do servidor, e nunca da entrada.
       *
       * Montar a URL com um host vindo do formulário deixaria alguém emitir um
       * convite que aponta para um domínio que ele controla — e o paciente
       * digitaria o e-mail dele lá.
       */
      const origin = await getApplicationOrigin()
      const path = `/portal-paciente/convite/${invite.token}`

      return ok({
        patientId: input.patientId,
        url: origin ? `${origin}${path}` : path,
        expiresLabel: formatShortDate(invite.expiresAt),
      })
    } catch (cause) {
      return toPatientPortalFailure<Field>('patientPortalInvite.create', cause)
    }
  },
  audit: (output) => ({
    action: 'patient_portal_invite.created',
    entityType: 'patient_portal_invites',
    entityId: null,
    // Sem token e sem e-mail. Ver o cabeçalho.
    after: { patient_id: output.patientId },
  }),
})

export async function createPortalInviteAction(
  rawInput: unknown,
): Promise<ActionResult<PortalInviteCreatedDto & { patientId: string }, Field>> {
  return runCreatePortalInvite(rawInput)
}
