'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toRecordEncounterDto } from '../application/toRecordDto'
import { medicalRecordRepositoryFor } from '../infrastructure/repository'
import {
  listRecordEncountersSchema,
  RECORD_ENCOUNTER_LIMIT,
  recordMessages,
  type ListRecordEncountersInput,
  type RecordEncounterDto,
} from '../schemas/record.schema'

type Field = 'patientId'

/**
 * Atendimentos do paciente, para escolher a que vincular a evolução.
 *
 * # Por que uma action de LEITURA
 *
 * Mesmo motivo do seletor de paciente (`patient.search`): a lista depende de uma
 * escolha feita DENTRO do modal, e navegar para carregá-la fecharia o formulário
 * que a pessoa está preenchendo. A rota não pode trazer isto adiantado — teria
 * de mandar os atendimentos de todos os pacientes da clínica, com queixa
 * clínica junto, para que talvez um deles fosse usado.
 *
 * Passa pelo `createAction` mesmo sendo leitura: autenticação, clínica ativa
 * resolvida pelo BANCO, papel e Zod vêm de graça e antes do handler. O que só
 * faz sentido em escrita fica de fora — sem `revalidatePaths`, sem `cacheTags`.
 *
 * # `record.read`, e não `encounter.read`
 *
 * A diferença é a razão de esta action existir separada de qualquer listagem do
 * módulo de atendimento: o que volta daqui inclui a **queixa principal**, e a
 * queixa é registro clínico. `receptionist` tem `encounter.read` e opera
 * `/atendimentos`; se esta lista respondesse a `encounter.read`, a queixa
 * chegaria à recepção pela porta lateral — exatamente o que a filtragem de
 * `toEncounterDto` impede na outra tela.
 *
 * # Por que não audita
 *
 * A leitura de prontuário é auditada na ROTA (`logAccess`), que é onde o
 * conteúdo clínico é entregue. Este seletor não mostra evolução nenhuma, e
 * gravar um evento a cada troca de paciente no formulário encheria a trilha de
 * ruído — tornando mais difícil achar o acesso que importa.
 */
const runListPatientEncounters = createAction<
  ListRecordEncountersInput,
  readonly RecordEncounterDto[],
  Field
>({
  name: 'record.encounters',
  schema: listRecordEncountersSchema,
  roles: rolesWith('record.read'),
  messages: {
    forbidden: recordMessages.forbidden,
    validation: recordMessages.invalidFields,
    unavailable: recordMessages.encountersUnavailable,
    unexpected: recordMessages.encountersUnavailable,
  },

  handler: async (input, context) => {
    const repository = medicalRecordRepositoryFor(context.supabase)

    try {
      const encounters = await repository.listPatientEncounters(
        context.clinicId,
        input.patientId,
        RECORD_ENCOUNTER_LIMIT,
      )

      return ok<readonly RecordEncounterDto[]>(
        encounters.map(toRecordEncounterDto),
      )
    } catch (cause) {
      /*
       * Só a CLASSE da falha vai para o log — nunca a mensagem.
       *
       * É a mesma regra de `toRecordFailure`, e vale aqui pelo mesmo motivo: o
       * erro do Postgres pode ecoar o valor consultado, e nesta consulta o valor
       * inclui `chief_complaint`.
       */
      console.error('[record.encounters] leitura recusada', {
        kind: cause instanceof Error ? cause.name : typeof cause,
      })

      return err<Field>('unavailable', recordMessages.encountersUnavailable)
    }
  },
})

export async function listPatientEncountersAction(
  rawInput: unknown,
): Promise<ActionResult<readonly RecordEncounterDto[], Field>> {
  return runListPatientEncounters(rawInput)
}
