import { describe, expect, it } from 'vitest'

import {
  createRecordSchema,
  listRecordEncountersSchema,
  RECORD_ENCOUNTER_LIMIT,
} from './record.schema'

/**
 * O contrato de entrada do prontuário.
 *
 * O foco aqui é o vínculo com o atendimento: `encounterId` é o único campo do
 * formulário que aponta para OUTRA linha do banco, e é por ele que uma evolução
 * poderia acabar pendurada na consulta errada.
 */

const PATIENT = '22222222-2222-4222-8222-222222222222'
const ENCOUNTER = '44444444-4444-4444-8444-444444444444'

const base = {
  patientId: PATIENT,
  recordType: 'evolution',
  content: 'Paciente relatou melhora da dor.',
}

describe('vínculo com o atendimento', () => {
  it('campo ausente vira null — registro sem consulta é caso legítimo', () => {
    // Nota de telefonema, resultado de exame que chegou depois: nem todo
    // registro nasce dentro de uma consulta.
    const parsed = createRecordSchema.parse(base)

    expect(parsed.encounterId).toBeNull()
  })

  it('string vazia vira null, e não uma tentativa de gravar ""', () => {
    // É o que o `<select>` manda quando a opção "sem vínculo" está escolhida.
    const parsed = createRecordSchema.parse({ ...base, encounterId: '' })

    expect(parsed.encounterId).toBeNull()
  })

  it('uuid é preservado', () => {
    const parsed = createRecordSchema.parse({ ...base, encounterId: ENCOUNTER })

    expect(parsed.encounterId).toBe(ENCOUNTER)
  })

  it('valor que não é uuid é recusado antes de chegar ao banco', () => {
    /*
     * Sem isto, o texto viraria `encounter_id` inválido e a falha só apareceria
     * como erro de coluna do Postgres — cujo texto pode ecoar o valor enviado,
     * que nesta action carrega conteúdo clínico junto.
     */
    expect(
      createRecordSchema.safeParse({ ...base, encounterId: 'consulta-de-hoje' })
        .success,
    ).toBe(false)
  })
})

describe('o resto do registro', () => {
  it('conteúdo vazio é recusado', () => {
    expect(createRecordSchema.safeParse({ ...base, content: '   ' }).success).toBe(
      false,
    )
  })

  it('tipo desconhecido cai em evolução em vez de derrubar o registro', () => {
    // `.catch('evolution')`: perder uma evolução já escrita por causa de um
    // rótulo é pior que gravá-la com o tipo mais comum.
    const parsed = createRecordSchema.parse({ ...base, recordType: 'inexistente' })

    expect(parsed.recordType).toBe('evolution')
  })
})

describe('listagem de atendimentos do paciente', () => {
  it('exige o paciente em forma de uuid', () => {
    expect(listRecordEncountersSchema.safeParse({ patientId: 'joao' }).success).toBe(
      false,
    )
    expect(listRecordEncountersSchema.safeParse({ patientId: PATIENT }).success).toBe(
      true,
    )
  })

  it('o teto do seletor é curto — é escolha, não histórico', () => {
    expect(RECORD_ENCOUNTER_LIMIT).toBeLessThanOrEqual(10)
  })
})
