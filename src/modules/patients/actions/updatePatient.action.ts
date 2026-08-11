'use server'

import { cacheTags } from '@/lib/cache/tags'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { changedFields } from '../application/changedFields'
import { patientWriteRoles } from '../application/patientWriteRoles'
import { toNewPatientData } from '../application/toNewPatientData'
import { toPatientDto } from '../application/toPatientDto'
import { toWriteFailure } from '../application/writeFailure'
import { patientRepositoryFor } from '../infrastructure/repository'
import {
  createPatientMessages,
  updatePatientSchema,
  type CreatePatientField,
  type PatientDto,
  type UpdatePatientInput,
} from '../schemas/patient.schema'

/**
 * Edicao do cadastro.
 *
 * Mesmo pipeline do cadastro (autenticar -> clinica ativa -> papel -> Zod ->
 * caso de uso -> revalidar -> auditar). A unica diferenca de entrada e o
 * `patientId`: o cliente escolhe O QUE editar, nunca ONDE — a clinica continua
 * saindo do `ActionContext` e o repositorio filtra por ela, entao um id de outra
 * clinica volta como 'not-found', sem revelar que aquele id existe em algum lugar.
 *
 * A edicao SUBSTITUI os campos recebidos: apagar um telefone e uma edicao
 * legitima. Por isso o formulario precisa chegar preenchido com o estado atual —
 * inclusive `admin_notes`, que so existe no dominio para este fim.
 */

const failureMessages = {
  conflict: createPatientMessages.conflict,
  forbidden: createPatientMessages.forbiddenEdit,
  notFound: createPatientMessages.notFound,
  unavailable: createPatientMessages.unavailable,
  unexpected: createPatientMessages.unexpectedEdit,
}

/**
 * Campos alterados, calculados no SERVIDOR e entregues ao callback de auditoria.
 *
 * O callback roda depois do handler (dentro de `after()`), quando o estado
 * anterior ja nao existe mais no banco — entao o diff precisa viajar de um para o
 * outro. A chave e o proprio objeto de saida, que o `createAction` repassa por
 * referencia.
 *
 * `WeakMap`, e nao `Map` por id de paciente, por duas razoes concretas: duas
 * recepcionistas editando o MESMO paciente ao mesmo tempo teriam uma sobrescrito
 * o diff da outra, e o log registraria a alteracao errada; e uma entrada orfa
 * (auditoria que nao chega a rodar) ficaria presa em memoria para sempre. Chave
 * por objeto e unica por chamada e some com a coleta de lixo.
 */
const changedByOutput = new WeakMap<PatientDto, readonly string[]>()

const runUpdatePatient = createAction<
  UpdatePatientInput,
  PatientDto,
  CreatePatientField
>({
  name: 'patient.update',
  schema: updatePatientSchema,
  roles: patientWriteRoles,
  messages: {
    forbidden: createPatientMessages.forbiddenEdit,
    validation: createPatientMessages.invalidFields,
    unavailable: createPatientMessages.unavailable,
    unexpected: createPatientMessages.unexpectedEdit,
    'not-found': createPatientMessages.notFound,
  },
  /**
   * `output.id`, e nao `input.patientId`: os dois valem o mesmo aqui, mas so um
   * deles e o id que o banco confirmou depois da RLS. Montar tag a partir da
   * entrada seria deixar o navegador escolher qual recorte de cache expirar
   * (F-02 — ver o JSDoc de `cacheTags` em `createAction`).
   */
  cacheTags: ({ clinicId }, output) => [
    cacheTags.patients(clinicId),
    cacheTags.patient(clinicId, output.id),
  ],
  /*
   * A ficha e o historico do paciente mostram nome, telefone e observacao — os
   * campos que esta escrita muda. O caminho e LITERAL, montado a partir do id
   * que o repositorio devolveu: ver `patientPaths`.
   */
  revalidatePaths: (_scope, output) => ['/pacientes', ...patientPaths(output.id)],

  handler: async (input, context) => {
    const repository = patientRepositoryFor(context.supabase)

    const data = toNewPatientData(input)

    try {
      // Leitura previa por dois motivos: responder 'not-found' antes de escrever,
      // e saber QUAIS campos mudaram — a pergunta que uma auditoria de edicao
      // precisa responder. Uma ida de rede a mais por save e barato para isso.
      const current = await repository.findById(context.clinicId, input.patientId)
      if (!current) {
        return err<CreatePatientField>('not-found', createPatientMessages.notFound)
      }

      /*
       * Duplicidade de CPF, com o PRÓPRIO paciente fora da conta.
       *
       * Salvar a ficha sem mexer no CPF acusaria conflito consigo mesma — e o
       * conflito apareceria justamente em quem já estava certo. Ver
       * `findCpfOwner`.
       */
      if (data.cpf) {
        const owner = await repository.findCpfOwner(
          context.clinicId,
          data.cpf,
          input.patientId,
        )

        if (owner) {
          return err<CreatePatientField>(
            'conflict',
            createPatientMessages.cpfTaken(owner.name),
            { cpf: createPatientMessages.cpfTaken(owner.name) },
          )
        }
      }

      const changed = changedFields(current, data)

      const patient = await repository.update(
        context.clinicId,
        input.patientId,
        data,
      )

      const dto = toPatientDto(patient)
      changedByOutput.set(dto, changed)

      return ok<PatientDto>(dto)
    } catch (cause) {
      return toWriteFailure<CreatePatientField>(
        'patient.update',
        cause,
        failureMessages,
      )
    }
  },

  /**
   * `patient.updated` — QUAIS campos mudaram, nunca os valores.
   *
   * `changed_fields` guarda nomes de coluna ('phone,email'). O conteudo novo e o
   * antigo ficam em `patients`, alcancaveis por `entity_id`.
   *
   * Best-effort como todo o resto: hoje a policy de INSERT de `audit_log` recusa
   * o membro autenticado (P-A1, verificada — ver docs/07-cadastro-de-pacientes.md),
   * entao a edicao acontece e o evento nao grava. O sinal fica no log do servidor.
   */
  audit: (output) => {
    const changed = changedByOutput.get(output) ?? []

    return {
      action: 'patient.updated',
      entityType: 'patient',
      entityId: output.id,
      after: {
        is_active: output.isActive,
        source: 'patient-profile',
        changed_count: changed.length,
        changed_fields: changed.join(',') || 'none',
      },
    }
  },
})

export async function updatePatientAction(
  rawInput: unknown,
): Promise<ActionResult<PatientDto, CreatePatientField>> {
  return runUpdatePatient(rawInput)
}
