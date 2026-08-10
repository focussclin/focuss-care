import { describe, expect, it } from 'vitest'

import {
  extractVariables,
  hasUnbalancedBraces,
  sortTemplates,
  templateCategories,
  TEMPLATE_LANGUAGE,
  type MessageTemplate,
} from './MessageTemplate'

function template(patch: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    id: 't1',
    name: 'Confirmação de consulta',
    category: 'Agendamento',
    language: TEMPLATE_LANGUAGE,
    body: 'Olá {{nome}}, sua consulta é {{data}}.',
    variables: ['nome', 'data'],
    isApproved: false,
    providerTemplateId: null,
    isActive: true,
    updatedAt: new Date('2026-08-10T10:00:00.000Z'),
    ...patch,
  }
}

/**
 * As variáveis saem do CORPO, e nunca de um campo digitado.
 *
 * Uma lista escrita à mão divergiria do texto no primeiro ajuste — e o dia em
 * que houvesse provedor, ele leria uma lista que não corresponde à mensagem.
 */
describe('variáveis derivadas do texto', () => {
  it('acha os marcadores na ordem em que aparecem', () => {
    expect(extractVariables('Olá {{nome}}, dia {{data}} às {{hora}}.')).toEqual([
      'nome',
      'data',
      'hora',
    ])
  })

  it('não repete a mesma variável', () => {
    // `{{nome}}` duas vezes é um marcador só, substituído nos dois lugares.
    expect(extractVariables('{{nome}}, confirmamos para {{nome}}.')).toEqual(['nome'])
  })

  it('tolera espaço dentro das chaves', () => {
    expect(extractVariables('Olá {{ nome }}.')).toEqual(['nome'])
  })

  it('ignora o que não é marcador válido', () => {
    /*
     * Espaço no meio do nome, acento e hífen não são aceitos pelos provedores
     * de mensagem. Aceitá-los aqui produziria modelos que nenhum consegue
     * processar depois.
     */
    expect(extractVariables('{{nome do paciente}}')).toEqual([])
    expect(extractVariables('{{nome-paciente}}')).toEqual([])
    expect(extractVariables('{{paciente_é}}')).toEqual([])
  })

  it('texto sem marcador não tem variável', () => {
    expect(extractVariables('Sua consulta foi confirmada.')).toEqual([])
  })

  it('aceita número e sublinhado', () => {
    expect(extractVariables('{{nome_do_paciente_1}}')).toEqual(['nome_do_paciente_1'])
  })
})

/**
 * Marcador aberto e não fechado é o erro fácil de cometer e difícil de ver: o
 * texto parece certo no editor e chega ao paciente com chaves soltas.
 */
describe('chaves desbalanceadas', () => {
  it('acusa marcador não fechado', () => {
    expect(hasUnbalancedBraces('Olá {{nome, tudo bem?')).toBe(true)
  })

  it('acusa fechamento sem abertura', () => {
    expect(hasUnbalancedBraces('Olá nome}}')).toBe(true)
  })

  it('acusa par que não forma marcador válido', () => {
    // Mesmo número dos dois lados, e mesmo assim não é variável nenhuma.
    expect(hasUnbalancedBraces('Olá {{nome do paciente}}')).toBe(true)
  })

  it('texto correto passa', () => {
    expect(hasUnbalancedBraces('Olá {{nome}}, dia {{data}}.')).toBe(false)
    expect(hasUnbalancedBraces('Sem variável nenhuma.')).toBe(false)
  })
})

describe('ordem e categorias', () => {
  it('ativos primeiro, depois alfabética', () => {
    const ordered = sortTemplates([
      template({ id: 'z', name: 'Zap final', isActive: true }),
      template({ id: 'a-off', name: 'Aviso', isActive: false }),
      template({ id: 'a-on', name: 'Aviso', isActive: true }),
    ])

    expect(ordered.map((item) => item.id)).toEqual(['a-on', 'z', 'a-off'])
  })

  it('as categorias vêm do que está cadastrado', () => {
    // Uma lista fixa seria uma taxonomia imposta a clínicas que já têm a delas.
    const found = templateCategories([
      template({ category: 'Pós-operatório' }),
      template({ category: 'Agendamento' }),
      template({ category: 'Agendamento' }),
      template({ category: null }),
    ])

    expect(found).toEqual(['Agendamento', 'Pós-operatório'])
  })
})

describe('idioma', () => {
  it('é fixo enquanto o produto é só pt-BR', () => {
    /*
     * A coluna é texto livre e nenhum registro existe para revelar a convenção
     * do provedor (`pt_BR`, com sublinhado, no WhatsApp Business). Chutar
     * criaria uma coluna cheia de valores que talvez precisem ser reescritos.
     */
    expect(TEMPLATE_LANGUAGE).toBe('pt-BR')
  })
})
