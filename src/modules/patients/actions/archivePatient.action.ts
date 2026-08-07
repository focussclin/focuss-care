'use server'

import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { patientWriteRoles } from '../application/patientWriteRoles'
import { toPatientDto } from '../application/toPatientDto'
import { toWriteFailure } from '../application/writeFailure'
import { patientRepositoryFor } from '../infrastructure/repository'
import {
  archivePatientSchema,
  createPatientMessages,
  type ArchivePatientInput,
  type PatientDto,
} from '../schemas/patient.schema'

/**
 * Arquivar e reativar o cadastro.
 *
 * **Arquivar nao e excluir.** A linha continua na base com `is_active = false`:
 * sai da listagem de ativos, aparece no filtro "Inativos" e volta quando alguem
 * reativa. Exclusao no produto e logica (`deleted_at`) e nao faz parte desta
 * fatia; `DELETE` e proibido pelo §8 do roadmap em qualquer caso.
 *
 * Uma acao so para os dois sentidos porque e a mesma operacao com o sinal
 * trocado — duas actions gemeas divergiriam na primeira mudanca de regra.
 */

const failureMessages = {
  conflict: createPatientMessages.conflict,
  forbidden: createPatientMessages.forbiddenEdit,
  notFound: createPatientMessages.notFound,
  unavailable: createPatientMessages.unavailable,
  unexpected: createPatientMessages.unexpectedArchive,
}

const runArchivePatient = createAction<ArchivePatientInput, PatientDto>({
  name: 'patient.archive',
  schema: archivePatientSchema,
  roles: patientWriteRoles,
  messages: {
    forbidden: createPatientMessages.forbiddenEdit,
    validation: createPatientMessages.unexpectedArchive,
    unavailable: createPatientMessages.unavailable,
    unexpected: createPatientMessages.unexpectedArchive,
    'not-found': createPatientMessages.notFound,
  },
  revalidatePaths: ['/pacientes'],

  handler: async (input, context) => {
    const repository = patientRepositoryFor(context.supabase)

    try {
      const patient = await repository.setArchived(
        context.clinicId,
        input.patientId,
        input.archived,
      )

      return ok<PatientDto>(toPatientDto(patient))
    } catch (cause) {
      return toWriteFailure('patient.archive', cause, failureMessages)
    }
  },

  /**
   * Dois verbos distintos — `patient.archived` e `patient.restored` — em vez de um
   * evento com um booleano. Auditoria se consulta por acao; "quem arquivou
   * pacientes neste mes" nao deveria exigir filtrar o JSON de metadados.
   */
  audit: (output, input) => ({
    action: input.archived ? 'patient.archived' : 'patient.restored',
    entityType: 'patient',
    entityId: output.id,
    after: { is_active: output.isActive, source: 'patient-profile' },
  }),
})

export async function archivePatientAction(
  rawInput: unknown,
): Promise<ActionResult<PatientDto>> {
  return runArchivePatient(rawInput)
}
