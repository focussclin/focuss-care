import { describe, expect, it } from 'vitest'

import { LEAD_STAGES } from '../domain/Lead'
import {
  convertLeadSchema,
  createLeadSchema,
  setLeadStageSchema,
  updateLeadSchema,
} from './lead.schema'

/**
 * O contrato de entrada do CRM.
 *
 * Reaplicado no servidor mesmo com a tela validando — é o que separa "a UI pede
 * direito" de "o servidor exige". Quem chama a Server Action direto não passa
 * pelo formulário.
 *
 * O que NÃO está aqui é metade do teste: **nenhum schema aceita `clinicId`**, e
 * o de conversão não aceita dado de paciente.
 */

const VALID_ID = '11111111-1111-4111-8111-111111111111'

/**
 * O mínimo que o schema exige.
 *
 * `phone`, `email`, `nextActionAt` e `assignedToId` são uniões que aceitam
 * `''`/`null` mas **não têm default** — a chave precisa existir. `stage`
 * também não tem default: a etapa inicial é decisão da tela, não do contrato,
 * e um default aqui faria um lead nascer em "novo" mesmo quando o formulário
 * quis outra coisa.
 */
const base = {
  name: 'Joana Prospect',
  phone: '',
  email: '',
  source: 'manual',
  stage: 'new' as const,
  nextActionAt: '',
  assignedToId: '',
}

describe('createLeadSchema', () => {
  it('aceita o mínimo e normaliza os vazios para null', () => {
    const parsed = createLeadSchema.parse(base)

    expect(parsed.name).toBe('Joana Prospect')
    expect(parsed.stage).toBe('new')
    // String vazia vira `null`: é o que o `<input>` manda quando ninguém
    // preenche, e `''` numa coluna de telefone é ruído que parece dado.
    expect(parsed.phone).toBeNull()
    expect(parsed.email).toBeNull()
    expect(parsed.nextActionAt).toBeNull()
    expect(parsed.assignedToId).toBeNull()
  })

  it('normaliza o e-mail para minúsculas', () => {
    const parsed = createLeadSchema.parse({ ...base, email: 'Joana@Exemplo.COM' })

    expect(parsed.email).toBe('joana@exemplo.com')
  })

  it('recusa e-mail malformado', () => {
    expect(createLeadSchema.safeParse({ ...base, email: 'joana@' }).success).toBe(
      false,
    )
  })

  it('remove espaços das pontas do nome', () => {
    expect(createLeadSchema.parse({ ...base, name: '  Joana  ' }).name).toBe(
      'Joana',
    )
  })

  it('recusa nome vazio', () => {
    expect(createLeadSchema.safeParse({ ...base, name: '   ' }).success).toBe(
      false,
    )
  })

  it('recusa etapa fora do enum do banco', () => {
    /*
     * `stage` vira a coluna `lead_stage`. Um valor fora do enum morreria no
     * Postgres com `22P02` — erro de driver, sem mensagem que ajude quem
     * preencheu.
     */
    expect(
      createLeadSchema.safeParse({ ...base, stage: 'em_negociacao' }).success,
    ).toBe(false)
  })

  it.each(LEAD_STAGES)('aceita a etapa %s', (stage) => {
    expect(createLeadSchema.safeParse({ ...base, stage }).success).toBe(true)
  })

  it('não aceita clinicId vindo do cliente', () => {
    // P3: o tenant nunca vem do navegador. Zod descarta a chave desconhecida.
    const parsed = createLeadSchema.parse({ ...base, clinicId: 'outra-clinica' })

    expect(parsed).not.toHaveProperty('clinicId')
  })

  it('não aceita convertedPatientId vindo do cliente', () => {
    /*
     * O vínculo com a ficha nasce da conversão, dentro da função do banco.
     * Aceitá-lo na entrada deixaria alguém apontar um lead para o paciente de
     * outra pessoa — e a tela mostraria "ver ficha" levando à pessoa errada.
     */
    const parsed = createLeadSchema.parse({
      ...base,
      convertedPatientId: VALID_ID,
    })

    expect(parsed).not.toHaveProperty('convertedPatientId')
  })
})

describe('updateLeadSchema', () => {
  it('exige id em forma de UUID', () => {
    expect(
      updateLeadSchema.safeParse({ ...base, leadId: 'lead-1' }).success,
    ).toBe(false)
  })

  it('herda as regras da criação', () => {
    expect(
      updateLeadSchema.safeParse({ ...base, leadId: VALID_ID, name: '' }).success,
    ).toBe(false)
  })
})

describe('setLeadStageSchema', () => {
  it('pede id e etapa válidos', () => {
    expect(
      setLeadStageSchema.parse({ leadId: VALID_ID, stage: 'contacted' }),
    ).toEqual({ leadId: VALID_ID, stage: 'contacted' })
  })

  it('recusa etapa inventada', () => {
    expect(
      setLeadStageSchema.safeParse({ leadId: VALID_ID, stage: 'ganho' }).success,
    ).toBe(false)
  })
})

describe('convertLeadSchema', () => {
  it('pede só o id do lead', () => {
    expect(convertLeadSchema.parse({ leadId: VALID_ID })).toEqual({
      leadId: VALID_ID,
    })
  })

  it('NÃO aceita dado de paciente na entrada', () => {
    /*
     * Nome, telefone e e-mail saem da linha do lead, dentro da função do banco.
     * Aceitá-los aqui permitiria criar um paciente com dados que nunca
     * estiveram no funil — e a conversão deixaria de ser conversão.
     */
    const parsed = convertLeadSchema.parse({
      leadId: VALID_ID,
      name: 'Outra Pessoa',
      phone: '11999990000',
      email: 'outra@exemplo.com',
    })

    expect(parsed).toEqual({ leadId: VALID_ID })
  })

  it('id malformado é recusado antes de ir ao banco', () => {
    expect(convertLeadSchema.safeParse({ leadId: '' }).success).toBe(false)
  })
})
