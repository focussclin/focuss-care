'use server'

import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { patientWriteRoles } from '../application/patientWriteRoles'
import { toPatientDto } from '../application/toPatientDto'
import { toWriteFailure } from '../application/writeFailure'
import { patientRepositoryFor } from '../infrastructure/repository'
import {
  createPatientMessages,
  createPatientSchema,
  type CreatePatientField,
  type CreatePatientInput,
  type PatientDto,
} from '../schemas/patient.schema'

/**
 * Cadastro de paciente — primeira mutacao tenant-scoped do produto (P-01 do
 * roadmap, e o primeiro chamador de runtime do `createAction`: pendencia P-A6 de
 * docs/06-acoes-e-auditoria.md).
 *
 * O pipeline do `createAction` faz, antes desta funcao ver qualquer coisa:
 * autenticar -> resolver a clinica ativa pelo banco -> autorizar o papel ->
 * validar Zod. Depois do sucesso: revalidar `/pacientes` e auditar. Por isso o
 * handler abaixo so contem o caso de uso.
 *
 * **`clinicId` e `userId` nao existem na entrada.** Vem do `ActionContext`, que os
 * deriva de `current_clinic_id()` e da sessao validada — P3 de
 * docs/01-arquitetura.md. Nao ha campo, nem parametro, por onde o navegador
 * influenciar a clinica de destino.
 */
const runCreatePatient = createAction<
  CreatePatientInput,
  PatientDto,
  CreatePatientField
>({
  name: 'patient.create',
  schema: createPatientSchema,
  roles: patientWriteRoles,
  messages: {
    forbidden: createPatientMessages.forbidden,
    validation: createPatientMessages.invalidFields,
    unavailable: createPatientMessages.unavailable,
    unexpected: createPatientMessages.unexpected,
  },
  revalidatePaths: ['/pacientes'],

  handler: async (input, context) => {
    const repository = patientRepositoryFor(context.supabase)

    try {
      const patient = await repository.create(
        context.clinicId,
        {
          fullName: input.name,
          birthDate: input.birthDate,
          phone: input.phone,
          email: input.email,
          adminNotes: input.notes,
        },
        context.userId,
      )

      // Somente escalares atravessam a fronteira: a entidade do dominio tem
      // `Date`, e a linha do Supabase tem colunas que a tela nao precisa ver.
      return ok<PatientDto>(toPatientDto(patient))
    } catch (cause) {
      return toWriteFailure<CreatePatientField>('patient.create', cause, {
        conflict: createPatientMessages.conflict,
        forbidden: createPatientMessages.forbidden,
        notFound: createPatientMessages.notFound,
        unavailable: createPatientMessages.unavailable,
        unexpected: createPatientMessages.unexpected,
      })
    }
  },

  /**
   * `patient.created` — o QUE aconteceu, nunca COM QUEM.
   *
   * Ator, clinica e papel sao derivados da sessao pelo `recordAuditEvent`. O
   * `after` carrega so metadado operacional: nome, telefone, e-mail, data de
   * nascimento e observacao ficam em `patients`, alcancaveis por `entity_id`.
   * `audit_log` e append-only e legivel por toda a operacao — dado pessoal que
   * entra aqui nao sai mais (secao 4 de docs/06-acoes-e-auditoria.md).
   *
   * A auditoria roda em `after()`, depois da resposta, e e best-effort. Hoje ela
   * NAO grava: a policy de INSERT de `audit_log` recusa o membro autenticado —
   * pendencia P-A1, agora verificada e descrita em docs/07-cadastro-de-pacientes.md.
   * O cadastro continua valido e o sinal fica no log do servidor.
   */
  audit: (output) => ({
    action: 'patient.created',
    entityType: 'patient',
    entityId: output.id,
    after: { is_active: true, source: 'patients-screen' },
  }),
})

export async function createPatientAction(
  rawInput: unknown,
): Promise<ActionResult<PatientDto, CreatePatientField>> {
  return runCreatePatient(rawInput)
}
