'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toMedicalRecordDto } from '../application/toRecordDto'
import { medicalRecordRepositoryFor } from '../infrastructure/repository'
import {
  listRecordVersionsSchema,
  recordMessages,
  type ListRecordVersionsInput,
  type MedicalRecordDto,
} from '../schemas/record.schema'

type Field = 'recordId'

/**
 * A cadeia de versões de um registro — feature **R-01**.
 *
 * # Por que isto precisa existir
 *
 * O módulo repete, em cinco arquivos, que o prontuário é append-only: corrigir
 * insere uma versão nova e a anterior continua legível. Só que **nenhuma tela
 * mostrava as anteriores**. O selo dizia "Versão 3" e as duas primeiras não
 * tinham por onde ser vistas — ou seja, "não editamos, versionamos" era uma
 * afirmação do código sobre si mesmo, sem superfície que a comprovasse.
 *
 * Um prontuário serve de prova porque o que foi registrado às 9h continua
 * legível às 18h, mesmo depois de corrigido. Guardar as versões e não as
 * mostrar dá o custo do versionamento sem a garantia que ele compra.
 *
 * # Por que uma action de LEITURA
 *
 * Mesmo motivo do seletor de vínculo: a cadeia depende de um registro escolhido
 * DENTRO da tela, e navegar para vê-la tiraria a pessoa da lista que ela está
 * lendo. Carregar tudo adiantado seria pior: a rota mandaria o texto clínico de
 * toda versão de todo registro para que talvez uma fosse aberta.
 *
 * Passa pelo `createAction` mesmo sendo leitura — autenticação, clínica ativa
 * resolvida pelo BANCO, papel e Zod vêm antes do handler. O que só faz sentido
 * em escrita fica de fora: sem `revalidatePaths`, sem `cacheTags`.
 *
 * # `record.read`, e a clínica não vem do cliente
 *
 * O que volta daqui é conteúdo clínico — o texto de cada versão. `recordId` é o
 * único campo da entrada; `clinicId` sai de `current_clinic_id()` e vai no
 * `WHERE` de **cada salto** da cadeia, dentro do adapter. Um id de outra clínica
 * devolve cadeia vazia, que esta action traduz como não encontrado: a resposta é
 * a mesma de um id inexistente, e é assim que ela não vira sonda de existência.
 *
 * # A leitura é auditada, e fora do caminho crítico
 *
 * Abrir versões antigas é ler prontuário, e no prontuário abrir também é um ato.
 * O registro vai por `logAccess` — a mesma porta que as duas rotas usam —, em
 * `afterSuccess`, que roda depois da resposta: quem está com o paciente na
 * frente não espera a trilha para ver o que foi corrigido.
 *
 * `target: 'versions'` separa este acesso do de abrir a ficha. Sem isso, os dois
 * chegariam à trilha como "leu o prontuário deste paciente", e a pergunta que se
 * faz numa investigação — quem foi ver o que mudou num registro corrigido —
 * ficaria sem resposta.
 */
const runListRecordVersions = createAction<
  ListRecordVersionsInput,
  readonly MedicalRecordDto[],
  Field
>({
  name: 'record.versions',
  schema: listRecordVersionsSchema,
  roles: rolesWith('record.read'),
  messages: {
    forbidden: recordMessages.forbidden,
    validation: recordMessages.invalidFields,
    unavailable: recordMessages.versionsUnavailable,
    unexpected: recordMessages.versionsUnavailable,
  },

  handler: async (input, context) => {
    const repository = medicalRecordRepositoryFor(context.supabase)

    try {
      const versions = await repository.listVersions(
        context.clinicId,
        input.recordId,
      )

      /*
       * Cadeia vazia é registro ausente NESTA clínica — e a tela precisa dizer
       * isso, não mostrar uma lista vazia. "Nenhuma versão" sobre um registro
       * que existe seria a afirmação mais errada possível aqui: diria que nada
       * foi corrigido.
       */
      if (versions.length === 0) {
        return err<Field>('not-found', recordMessages.notFound)
      }

      return ok<readonly MedicalRecordDto[]>(versions.map(toMedicalRecordDto))
    } catch (cause) {
      /*
       * Só a CLASSE da falha vai para o log — nunca a mensagem.
       *
       * Mesma regra de `toRecordFailure`: o erro do Postgres pode ecoar o valor
       * consultado, e aqui o valor consultado é o texto de uma evolução.
       */
      console.error('[record.versions] leitura recusada', {
        kind: cause instanceof Error ? cause.name : typeof cause,
      })

      return err<Field>('unavailable', recordMessages.versionsUnavailable)
    }
  },

  afterSuccess: async (output, _input, context) => {
    /*
     * O paciente sai da linha que o banco devolveu, nunca da entrada — que nem
     * o oferece. Todas as versões da cadeia são do mesmo paciente: ele é
     * herdado da anterior a cada correção.
     */
    const patientId = output[0]?.patientId
    if (!patientId) return

    await medicalRecordRepositoryFor(context.supabase).logAccess(
      context.clinicId,
      { target: 'versions', patientId },
    )
  },
})

export async function listRecordVersionsAction(
  rawInput: unknown,
): Promise<ActionResult<readonly MedicalRecordDto[], Field>> {
  return runListRecordVersions(rawInput)
}
