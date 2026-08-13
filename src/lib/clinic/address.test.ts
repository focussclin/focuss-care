import { describe, expect, it } from 'vitest'

import {
  EMPTY_CLINIC_ADDRESS,
  formatClinicAddress,
  hasClinicAddress,
  parseStoredClinicAddress,
} from './address'

/**
 * O endereço da clínica — lido e escrito pelo mesmo contrato.
 *
 * O que este arquivo protege: o assistente de WhatsApp usa `formatClinicAddress`
 * para responder "onde vocês ficam?". Uma frase montada com pontuação solta
 * ("— , /,") seria pior que a resposta que ele dá sem endereço nenhum ("vou
 * confirmar com a equipe").
 */

function endereco(overrides: Partial<typeof EMPTY_CLINIC_ADDRESS> = {}) {
  return { ...EMPTY_CLINIC_ADDRESS, ...overrides }
}

describe('leitura do jsonb', () => {
  it('lê o que foi gravado', () => {
    const lido = parseStoredClinicAddress({
      street: 'Rua das Flores',
      number: '120',
      complement: null,
      district: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01000-000',
    })

    expect(lido.street).toBe('Rua das Flores')
    expect(lido.city).toBe('São Paulo')
  })

  it('conteúdo irreconhecível vira endereço vazio, não erro', () => {
    /*
     * O cadastro da clínica não pode deixar de abrir porque alguém gravou algo
     * estranho na coluna por outro caminho.
     */
    expect(parseStoredClinicAddress('rua tal')).toEqual(EMPTY_CLINIC_ADDRESS)
    expect(parseStoredClinicAddress(null)).toEqual(EMPTY_CLINIC_ADDRESS)
    expect(parseStoredClinicAddress([])).toEqual(EMPTY_CLINIC_ADDRESS)
    expect(parseStoredClinicAddress(42)).toEqual(EMPTY_CLINIC_ADDRESS)
  })

  it('chave desconhecida não passa', () => {
    // `.strict()`: o que não está no contrato não entra em silêncio para alguém
    // encontrar depois sem saber o que é.
    expect(
      parseStoredClinicAddress({ ...EMPTY_CLINIC_ADDRESS, pais: 'Brasil' }),
    ).toEqual(EMPTY_CLINIC_ADDRESS)
  })

  it('campo vazio vira null', () => {
    const lido = parseStoredClinicAddress({ ...EMPTY_CLINIC_ADDRESS, street: '   ' })

    expect(lido.street).toBeNull()
  })
})

describe('a frase que o assistente usa', () => {
  it('endereço completo vira uma linha legível', () => {
    const frase = formatClinicAddress(
      endereco({
        street: 'Rua das Flores',
        number: '120',
        complement: 'sala 3',
        district: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01000-000',
      }),
    )

    expect(frase).toBe(
      'Rua das Flores, 120, sala 3 — Centro, São Paulo/SP, 01000-000',
    )
  })

  it('endereço parcial não deixa pontuação solta', () => {
    /*
     * O caso que a montagem ingênua erra: só rua e cidade produziria
     * 'Rua das Flores,  — , São Paulo/, ' com uma concatenação direta.
     */
    const frase = formatClinicAddress(
      endereco({ street: 'Rua das Flores', city: 'São Paulo' }),
    )

    expect(frase).toBe('Rua das Flores — São Paulo')
    expect(frase).not.toMatch(/,\s*,|—\s*$|,\s*$/)
  })

  it('só cidade e UF funciona', () => {
    expect(formatClinicAddress(endereco({ city: 'Recife', state: 'PE' }))).toBe(
      'Recife/PE',
    )
  })

  it('endereço vazio devolve null', () => {
    // `null` faz o assistente dizer que confirma com a equipe, em vez de mandar
    // uma linha de pontuação.
    expect(formatClinicAddress(EMPTY_CLINIC_ADDRESS)).toBeNull()
  })

  it('número sem rua não inventa vírgula inicial', () => {
    expect(formatClinicAddress(endereco({ number: 's/n', city: 'Olinda' }))).toBe(
      's/n — Olinda',
    )
  })
})

describe('há endereço?', () => {
  it('vazio é vazio', () => {
    expect(hasClinicAddress(EMPTY_CLINIC_ADDRESS)).toBe(false)
  })

  it('um campo basta', () => {
    expect(hasClinicAddress(endereco({ city: 'Curitiba' }))).toBe(true)
  })
})
