'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toLeadFailure } from '../application/leadFailure'
import { leadRepositoryFor } from '../infrastructure/repository'
import {
  convertLeadSchema,
  leadMessages,
  type ConvertLeadInput,
} from '../schemas/lead.schema'

type Fields = 'leadId'

/**
 * Converte o lead em paciente — feature **CRM e Leads**.
 *
 * # A permissão é `patient.write`, e não `team.read`
 *
 * As outras três actions do módulo pedem `team.read`, porque mexem no funil.
 * Esta cria uma **ficha de paciente**, e ficha de paciente é cadastro clínico:
 * quem não pode cadastrar paciente pela tela de pacientes não pode cadastrar
 * pelo CRM. Manter `team.read` aqui seria uma porta lateral para o mesmo
 * efeito, e `finance` — que tem acesso ao funil por `team.read`… — na verdade
 * não tem: `finance` não possui `team.read`. Mas `professional` e
 * `receptionist` possuem os dois, e é a diferença que importa no dia em que a
 * matriz mudar.
 *
 * A função do banco repete a checagem com `has_clinic_role`. As duas existem
 * porque protegem coisas diferentes: esta recusa cedo e com mensagem boa; a de
 * lá vale também para quem chamar o PostgREST direto.
 *
 * # Revalida a ficha do paciente NOVO
 *
 * `/crm` porque o funil mudou, e o caminho do paciente recém-criado porque ele
 * passou a existir. O id sai do `output` — ou seja, do banco, depois da RLS —
 * e nunca da entrada.
 */
const runConvertLead = createAction<
  ConvertLeadInput,
  { leadId: string; patientId: string },
  Fields
>({
  name: 'lead.convert',
  schema: convertLeadSchema,
  roles: rolesWith('patient.write'),
  messages: {
    forbidden: leadMessages.convertForbidden,
    validation: leadMessages.invalidFields,
    unavailable: leadMessages.unavailable,
    unexpected: leadMessages.unexpected,
  },
  revalidatePaths: (_scope, output) => ['/crm', ...patientPaths(output.patientId)],
  handler: async (input, context) => {
    try {
      const { patientId } = await leadRepositoryFor(context.supabase).convert(
        context.clinicId,
        input.leadId,
      )

      return ok({ leadId: input.leadId, patientId })
    } catch (cause) {
      return toLeadFailure<Fields>('lead.convert', cause)
    }
  },
  audit: (output) => ({
    action: 'lead.converted',
    entityType: 'lead',
    entityId: output.leadId,
    // O id do paciente entra porque é o que liga as duas pontas na trilha:
    // sem ele, "convertido" não diz em quem.
    after: { converted_patient_id: output.patientId },
  }),
})

export async function convertLeadAction(
  rawInput: unknown,
): Promise<ActionResult<{ leadId: string; patientId: string }, Fields>> {
  return runConvertLead(rawInput)
}
