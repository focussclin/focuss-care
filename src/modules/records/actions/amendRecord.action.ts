'use server'

import { getCurrentProfessionalId } from '@/lib/auth/active-clinic'
import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toRecordFailure } from '../application/recordFailure'
import { toMedicalRecordDto } from '../application/toRecordDto'
import { medicalRecordRepositoryFor } from '../infrastructure/repository'
import {
  amendRecordSchema,
  recordMessages,
  type AmendRecordInput,
  type MedicalRecordDto,
} from '../schemas/record.schema'

/**
 * Correção de registro — feature **R-01**.
 *
 * # Corrigir é ACRESCENTAR, não reescrever
 *
 * Esta action não atualiza nada. Ela cria a versão seguinte, apontando para a
 * anterior por `supersedes_id`. O texto original continua legível, com autor e
 * hora próprios, e quem auditar vê as duas versões e a ordem entre elas.
 *
 * É a diferença entre "o profissional corrigiu a evolução às 14h" e "a evolução
 * sempre disse isso". A primeira é registro clínico; a segunda é um documento
 * sem valor probatório.
 *
 * A correção pode ser feita por outro profissional — quem corrige assina a
 * versão nova, e a antiga continua assinada por quem a escreveu. Por isso
 * `authorId` é resolvido de novo aqui, na sessão de quem está corrigindo.
 */
const runAmendRecord = createAction<
  AmendRecordInput,
  MedicalRecordDto,
  'content'
>({
  name: 'record.amend',
  schema: amendRecordSchema,
  roles: rolesWith('record.write'),
  messages: {
    forbidden: recordMessages.forbidden,
    validation: recordMessages.invalidFields,
    unavailable: recordMessages.unavailable,
    unexpected: recordMessages.unexpected,
  },
  revalidatePaths: ['/prontuarios'],

  handler: async (input, context) => {
    const authorId = await getCurrentProfessionalId()

    if (!authorId) {
      return err<'content'>('forbidden', recordMessages.notAProfessional)
    }

    const repository = medicalRecordRepositoryFor(context.supabase)

    try {
      const record = await repository.amend(
        context.clinicId,
        input.recordId,
        input.content,
        authorId,
        context.userId,
      )

      return ok<MedicalRecordDto>(toMedicalRecordDto(record))
    } catch (cause) {
      return toRecordFailure<'content'>('record.amend', cause)
    }
  },

  /**
   * O evento registra QUE houve correção e QUAL versão ela substitui — nunca o
   * texto, nem o antigo nem o novo. Ver `createRecord.action.ts`.
   */
  audit: (output) => ({
    action: 'record.amended',
    entityType: 'medical_record',
    entityId: output.id,
    before: { superseded_id: output.supersedesId },
    after: { version: output.version, patient_id: output.patientId },
  }),
})

export async function amendRecordAction(
  rawInput: unknown,
): Promise<ActionResult<MedicalRecordDto, 'content'>> {
  return runAmendRecord(rawInput)
}
