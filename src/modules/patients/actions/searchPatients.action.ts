'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { patientRepositoryFor } from '../infrastructure/repository'
import {
  patientPickerMessages,
  PICKER_RESULT_LIMIT,
  searchPatientsSchema,
  type PatientOptionDto,
  type SearchPatientsInput,
} from '../schemas/patientPicker.schema'

type Field = 'query'

/**
 * Busca de paciente para o seletor do Novo Agendamento.
 *
 * # Por que uma action de LEITURA
 *
 * O resto do produto lê na rota, e continua assim. Este caso é diferente por um
 * motivo concreto: o seletor vive dentro de um modal, e navegar para aplicar um
 * filtro fecharia o formulário que a pessoa está preenchendo. Precisa ser
 * chamável sem sair da tela.
 *
 * Passa pelo `createAction` mesmo sendo leitura, e isso é reuso e não desvio: o
 * pipeline entrega autenticação, clínica ativa resolvida pelo BANCO, papel
 * autorizado e Zod — os quatro antes de o handler ver qualquer coisa. Escrever
 * isso à mão numa action nova é exatamente o erro que o pipeline existe para
 * impedir. O que não se aplica a uma leitura fica de fora: não há
 * `revalidatePaths`, não há `cacheTags` e não há `audit`.
 *
 * # O que NÃO atravessa a fronteira
 *
 * `clinicId` não é parâmetro. Ele sai de `current_clinic_id()` no
 * `ActionContext`, como em toda escrita do produto (P3) — um seletor que
 * aceitasse a clínica pelo cliente seria a porta mais barata para ler a base de
 * outro inquilino. E a RLS continua sendo a última linha: o cliente Supabase do
 * contexto carrega a sessão do usuário, nunca a `service_role`.
 *
 * # Por que não audita
 *
 * Ler o nome de um paciente numa lista não é auditado em nenhum lugar do
 * produto hoje — `/pacientes` também não audita. O que é auditado é a leitura de
 * PRONTUÁRIO (R-01), que é dado de saúde. Auditar cada tecla digitada num
 * seletor encheria a trilha de ruído e tornaria mais difícil achar o acesso que
 * importa.
 */
const runSearchPatients = createAction<
  SearchPatientsInput,
  readonly PatientOptionDto[],
  Field
>({
  name: 'patient.search',
  schema: searchPatientsSchema,
  roles: rolesWith('patient.read'),
  messages: {
    forbidden: patientPickerMessages.forbidden,
    unavailable: patientPickerMessages.unavailable,
    unexpected: patientPickerMessages.unexpected,
  },

  handler: async (input, context) => {
    const repository = patientRepositoryFor(context.supabase)

    try {
      /*
       * Reusa `listPage`, a porta que a tela de pacientes já usa. Uma consulta
       * própria para o seletor duplicaria a regra de busca — e as duas
       * divergiriam sobre o que casa com o quê.
       *
       * `status: 'active'` porque não se marca consulta para paciente
       * arquivado; `cursor: null` porque quem procura no seletor refina o
       * termo em vez de paginar.
       */
      const page = await repository.listPage(context.clinicId, {
        search: input.query,
        status: 'active',
        limit: PICKER_RESULT_LIMIT,
        cursor: null,
      })

      return ok<readonly PatientOptionDto[]>(
        page.items.map((patient) => ({
          id: patient.id,
          name: patient.name,
        })),
      )
    } catch (cause) {
      /*
       * Só a CLASSE da falha vai para o log. A mensagem do Postgres pode ecoar
       * o termo buscado, e o termo é o nome de uma pessoa.
       */
      console.error('[patient.search] leitura recusada', {
        kind: cause instanceof Error ? cause.name : typeof cause,
      })

      return err<Field>('unavailable', patientPickerMessages.unavailable)
    }
  },
})

export async function searchPatientsAction(
  rawInput: unknown,
): Promise<ActionResult<readonly PatientOptionDto[], Field>> {
  return runSearchPatients(rawInput)
}
