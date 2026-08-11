'use server'

import { getCurrentProfessionalId } from '@/lib/auth/active-clinic'
import { rolesWith } from '@/lib/auth/permissions'
import { patientPaths } from '@/lib/routes/patientRoutes'
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
 *
 * # A terceira porta: o atendimento vinculado
 *
 * `encounter_id` era campo morto — a coluna existe desde o primeiro schema, o
 * repositório sempre a gravou, e **o formulário nunca a enviou**: toda evolução
 * da base nasceu solta, sem dizer de qual consulta saiu.
 *
 * Agora que o vínculo é escolhido na tela, ele passa a ser entrada não confiável
 * como qualquer outra. A FK de `medical_records` é de coluna única: prova que o
 * atendimento existe, não que ele é desta clínica nem deste paciente. Sem a
 * conferência, um id trocado penduraria a evolução de uma pessoa na consulta de
 * outra — e o banco aceitaria.
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
  /**
   * Duas telas leem o que esta action escreve.
   *
   * `/prontuarios` lista os registros recentes da clínica; a FICHA do paciente
   * mostra o prontuário dele. Revalidar só a primeira deixaria quem registrou
   * pela ficha olhando para a lista anterior ao próprio registro — e a leitura
   * seguinte pareceria não ter salvo nada.
   *
   * O caminho é literal, montado pelo helper a partir do `output`: o padrão
   * `'/pacientes/[patientId]'` invalidaria a ficha de todos os pacientes da
   * instalação a cada evolução escrita.
   */
  revalidatePaths: (_scope, output) => [
    '/prontuarios',
    ...patientPaths(output.patientId),
  ],

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
      if (
        input.encounterId !== null &&
        !(await repository.encounterBelongsTo(
          context.clinicId,
          input.encounterId,
          input.patientId,
        ))
      ) {
        return err<'patientId' | 'content'>(
          'not-found',
          recordMessages.encounterMismatch,
        )
      }

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
      /*
       * O VÍNCULO entra; a queixa do atendimento, não.
       *
       * Um id não diz nada sobre a saúde de ninguém, e é ele que responde a
       * pergunta que a auditoria faz de verdade: "de qual consulta saiu este
       * registro?". `chief_complaint` fica onde está, sob a RLS de `encounters`.
       */
      encounter_id: output.encounterId,
    },
  }),
})

export async function createRecordAction(
  rawInput: unknown,
): Promise<ActionResult<MedicalRecordDto, 'patientId' | 'content'>> {
  return runCreateRecord(rawInput)
}
