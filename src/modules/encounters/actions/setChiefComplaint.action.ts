'use server'

import { can, rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toEncounterFailure } from '../application/encounterFailure'
import { toEncounterDto } from '../application/toEncounterDto'
import { encounterRepositoryFor } from '../infrastructure/repository'
import {
  setChiefComplaintSchema,
  encounterMessages,
  type EncounterDto,
  type SetChiefComplaintInput,
} from '../schemas/encounter.schema'

/**
 * Queixa principal — feature **E-03**.
 *
 * # Por que uma action própria, e não um campo em `startEncounter`
 *
 * Iniciar o atendimento é ato da RECEPÇÃO: ela chama, o paciente entra, a fila
 * anda. Dizer o que a pessoa tem é de quem ATENDE. Juntar as duas coisas
 * obrigaria a recepção a digitar conteúdo clínico para a fila andar — e o que
 * ela digitasse entraria no prontuário como afirmação clínica.
 *
 * A queixa também se corrige durante a consulta: o que o paciente diz na porta
 * raramente é o que se registra depois de examinar.
 *
 * # `record.write`, e não `encounter.write`
 *
 * As outras quatro actions deste módulo pedem `encounter.write` — recepção
 * inclusive. Esta pede a permissão CLÍNICA, e a diferença é real na matriz de
 * I-05: `receptionist` tem `encounter.write` e **não** tem `record.write`.
 * `admin` também não: administrar a clínica não é cuidar do paciente.
 */
const runSetChiefComplaint = createAction<
  SetChiefComplaintInput,
  EncounterDto,
  'encounterId' | 'chiefComplaint'
>({
  name: 'encounter.set_chief_complaint',
  schema: setChiefComplaintSchema,
  roles: rolesWith('record.write'),
  messages: {
    forbidden: encounterMessages.chiefComplaintForbidden,
    validation: encounterMessages.invalidFields,
    unavailable: encounterMessages.unavailable,
    unexpected: encounterMessages.unexpected,
  },
  revalidatePaths: ['/atendimentos'],

  handler: async (input, context) => {
    try {
      const encounter = await encounterRepositoryFor(
        context.supabase,
      ).setChiefComplaint(
        context.clinicId,
        input.encounterId,
        input.chiefComplaint,
      )

      return ok<EncounterDto>(
        toEncounterDto(encounter, can(context.role, 'record.read')),
      )
    } catch (cause) {
      return toEncounterFailure<'encounterId' | 'chiefComplaint'>(
        'encounter.set_chief_complaint',
        cause,
        {
          /*
           * `invalid-transition` aqui não é "a fila andou": é o atendimento
           * ENCERRADO. A mensagem precisa dizer isso, senão manda recarregar uma
           * tela que já está certa.
           */
          invalidTransition: encounterMessages.chiefComplaintClosed,
          forbidden: encounterMessages.chiefComplaintForbidden,
        },
      )
    }
  },

  /**
   * **O TEXTO da queixa NÃO entra na trilha.**
   *
   * É a informação clínica mais sensível deste módulo — diz o que a pessoa tem —
   * e `audit_log` é append-only e legível pela operação inteira, incluindo
   * papéis que não têm `record.read`. Gravá-lo ali contornaria a própria
   * filtragem que esta fatia implementa.
   *
   * O evento registra que houve registro e se a queixa foi APAGADA. É o que uma
   * auditoria precisa responder — quem mexeu e quando —, e o conteúdo continua
   * em `encounters.chief_complaint`, alcançável por `entity_id`, sob a RLS da
   * tabela.
   */
  audit: (output, input) => ({
    action: 'encounter.chief_complaint_recorded',
    entityType: 'encounter',
    entityId: output.id,
    after: { cleared: input.chiefComplaint === null },
  }),
})

export async function setChiefComplaintAction(
  rawInput: unknown,
): Promise<ActionResult<EncounterDto, 'encounterId' | 'chiefComplaint'>> {
  return runSetChiefComplaint(rawInput)
}
