'use server'

import { getCurrentProfessionalId } from '@/lib/auth/active-clinic'
import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toRecordFailure } from '../application/recordFailure'
import { toMedicalRecordDto } from '../application/toRecordDto'
import { medicalRecordRepositoryFor } from '../infrastructure/repository'
import {
  createRecordSchema,
  recordMessages,
  type CreateRecordInput,
  type MedicalRecordDto,
} from '../schemas/record.schema'

/**
 * Primeira versão de um registro de prontuário — feature **R-01**.
 *
 * # Duas portas, e as duas fecham
 *
 *  1. **Papel** (`rolesWith('record.write')` — matriz de I-05): só `owner` e
 *     `professional`. Administrar a clínica não é cuidar do paciente.
 *  2. **Cadastro profissional** (`current_professional_id()`): quem não tem
 *     linha em `professionals` não assina prontuário, mesmo com papel
 *     permitido. `author_id` é `professionals.id` — o registro precisa apontar
 *     para quem tem conselho e responsabilidade clínica, não para um login.
 *
 * A segunda existe porque a primeira não basta: um `owner` que administra a
 * clínica sem ser clínico passa pelo papel e para aqui, com uma mensagem que
 * diz o que fazer em vez de "sem permissão".
 *
 * `authorId` **nunca vem do cliente**: sai da RPC do banco, na sessão. Aceitá-lo
 * do formulário deixaria alguém assinar um registro em nome de outro
 * profissional — que, em prontuário, é falsidade ideológica.
 */
const runCreateRecord = createAction<
  CreateRecordInput,
  MedicalRecordDto,
  'patientId' | 'content'
>({
  name: 'record.create',
  schema: createRecordSchema,
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
      return err<'patientId' | 'content'>(
        'forbidden',
        recordMessages.notAProfessional,
      )
    }

    const repository = medicalRecordRepositoryFor(context.supabase)

    try {
      const record = await repository.create(
        context.clinicId,
        {
          patientId: input.patientId,
          encounterId: input.encounterId,
          recordType: input.recordType,
          content: input.content,
        },
        authorId,
        context.userId,
      )

      return ok<MedicalRecordDto>(toMedicalRecordDto(record))
    } catch (cause) {
      return toRecordFailure<'patientId' | 'content'>('record.create', cause)
    }
  },

  /**
   * O evento diz que houve registro — **nunca o que foi registrado**.
   *
   * `audit_log` é append-only e legível por toda a operação, incluindo quem não
   * tem acesso clínico. Um trecho de evolução ali seria acesso ao prontuário
   * pela porta lateral, sem passar por `can_access_clinical()`. O conteúdo fica
   * em `medical_records`, alcançável por `entity_id`, sob a RLS da tabela.
   */
  audit: (output) => ({
    action: 'record.created',
    entityType: 'medical_record',
    entityId: output.id,
    after: {
      record_type: output.recordType,
      version: output.version,
      patient_id: output.patientId,
    },
  }),
})

export async function createRecordAction(
  rawInput: unknown,
): Promise<ActionResult<MedicalRecordDto, 'patientId' | 'content'>> {
  return runCreateRecord(rawInput)
}
