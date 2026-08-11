import { describe, expect, it } from 'vitest'

import {
  BIOLOGICAL_SEX_OPTIONS,
  BIOLOGICAL_SEX_VALUES,
  biologicalSexLabel,
  isUsableEmergencyContact,
  preferredName,
  showsLegalName,
} from './PatientIdentity'

/**
 * Nome social não é apelido: quando existe, é como a pessoa é chamada.
 *
 * Chamar alguém pelo nome de registro na sala de espera, existindo nome social,
 * é o dano que a coluna existe para evitar.
 */
describe('nome preferido', () => {
  it('o social vence quando existe', () => {
    expect(preferredName({ name: 'João da Silva', socialName: 'Joana' })).toBe(
      'Joana',
    )
  })

  it('sem social, usa o de registro', () => {
    expect(preferredName({ name: 'João da Silva', socialName: null })).toBe(
      'João da Silva',
    )
  })

  it('social só com espaço não conta', () => {
    // '   ' passaria por um `??` ingênuo e o paciente ficaria SEM nome na tela.
    expect(preferredName({ name: 'João da Silva', socialName: '   ' })).toBe(
      'João da Silva',
    )
  })

  it('ausente é o mesmo que nulo', () => {
    expect(preferredName({ name: 'Ana' })).toBe('Ana')
  })
})

/**
 * O nome de registro precisa aparecer junto quando difere — quem confere
 * documento, guia ou receita precisa dos dois.
 */
describe('quando mostrar o nome de registro', () => {
  it('mostra quando difere do social', () => {
    expect(showsLegalName({ name: 'João da Silva', socialName: 'Joana' })).toBe(
      true,
    )
  })

  it('não mostra quando não há social', () => {
    // Repetir o mesmo nome em dois campos é ruído.
    expect(showsLegalName({ name: 'Ana', socialName: null })).toBe(false)
  })

  it('não mostra quando são iguais', () => {
    expect(showsLegalName({ name: 'Ana', socialName: 'Ana' })).toBe(false)
  })
})

describe('sexo biológico', () => {
  it('os quatro valores do enum são oferecidos', () => {
    /*
     * Três deles eram inalcançáveis pela aplicação inteira: o adapter gravava
     * `not_informed` em toda linha.
     */
    expect([...BIOLOGICAL_SEX_VALUES]).toEqual([
      'not_informed',
      'female',
      'male',
      'intersex',
    ])
  })

  it('`not_informed` vem primeiro, e é opção de verdade', () => {
    // É o estado de toda linha criada antes desta fatia, e continua sendo a
    // resposta honesta quando ninguém perguntou.
    expect(BIOLOGICAL_SEX_OPTIONS[0]).toEqual({
      value: 'not_informed',
      label: 'Não informado',
    })
  })

  it('todo valor tem rótulo em pt-BR', () => {
    const semRotulo = BIOLOGICAL_SEX_VALUES.filter(
      (value) => !biologicalSexLabel(value) || biologicalSexLabel(value) === value,
    )

    expect(semRotulo).toEqual([])
  })
})

/**
 * Um contato de emergência sem telefone não serve para nada: é numa emergência
 * que alguém vai procurar este campo.
 */
describe('contato de emergência utilizável', () => {
  it('nome e telefone bastam', () => {
    expect(isUsableEmergencyContact({ name: 'Maria', phone: '11988124471' })).toBe(
      true,
    )
  })

  it('nome sem telefone não serve', () => {
    expect(isUsableEmergencyContact({ name: 'Maria', phone: null })).toBe(false)
  })

  it('telefone sem nome não serve', () => {
    // Ninguém sabe quem está atendendo do outro lado.
    expect(isUsableEmergencyContact({ name: '', phone: '11988124471' })).toBe(false)
  })

  it('espaço em branco não preenche nada', () => {
    expect(isUsableEmergencyContact({ name: '  ', phone: '  ' })).toBe(false)
  })
})
