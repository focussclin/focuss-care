import { describe, expect, it } from 'vitest'

import { InvalidCacheTagError, cacheTags } from './tags'

/**
 * O que estes testes protegem: **P4 do roadmap** — toda tag de cache carrega
 * `clinic_id`. A afirmacao so vale se duas clinicas nunca produzirem a mesma tag
 * e se a fabrica recusar o que nao for identificador de banco.
 *
 * Nao ha rede, banco nem Next aqui: `tags.ts` e TS puro de proposito.
 */

const CLINIC_A = '7e3b0000-0000-4000-8000-00000000b48e'
const CLINIC_B = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const PATIENT = '9019956f-bdd8-4d61-868d-09b02332dad0'
const OTHER_PATIENT = '3f2a11cc-7d90-4b1e-8a44-5c6d7e8f9a0b'

describe('formato', () => {
  it('prefixa toda tag com a clinica, no formato da secao 8 de 01-arquitetura', () => {
    expect(cacheTags.patients(CLINIC_A)).toBe(`clinic:${CLINIC_A}:patients`)
    expect(cacheTags.patient(CLINIC_A, PATIENT)).toBe(
      `clinic:${CLINIC_A}:patient:${PATIENT}`,
    )
    expect(cacheTags.agenda(CLINIC_A, '2026-08-07')).toBe(
      `clinic:${CLINIC_A}:agenda:2026-08-07`,
    )
  })

  it('cabe no limite de 256 caracteres por tag do Next', () => {
    for (const tag of [
      cacheTags.patients(CLINIC_A),
      cacheTags.patient(CLINIC_A, PATIENT),
      cacheTags.agenda(CLINIC_A, '2026-12-31'),
    ]) {
      expect(tag.length).toBeLessThanOrEqual(256)
    }
  })

  it('nenhuma tag existe sem a clinica no prefixo', () => {
    for (const tag of [
      cacheTags.patients(CLINIC_A),
      cacheTags.patient(CLINIC_A, PATIENT),
      cacheTags.agenda(CLINIC_A, '2026-08-07'),
    ]) {
      expect(tag.startsWith(`clinic:${CLINIC_A}:`)).toBe(true)
    }
  })
})

describe('determinismo', () => {
  it('a mesma entrada produz sempre a mesma tag', () => {
    expect(cacheTags.patients(CLINIC_A)).toBe(cacheTags.patients(CLINIC_A))
    expect(cacheTags.patient(CLINIC_A, PATIENT)).toBe(
      cacheTags.patient(CLINIC_A, PATIENT),
    )
    expect(cacheTags.agenda(CLINIC_A, '2026-08-07')).toBe(
      cacheTags.agenda(CLINIC_A, '2026-08-07'),
    )
  })

  it('normaliza caixa: o mesmo uuid em maiusculas nao vira outra tag', () => {
    // `updateTag` e case-sensitive. Sem isto, a escrita invalidaria uma tag que a
    // leitura nunca criou — invalidacao que nao invalida nada.
    expect(cacheTags.patients(CLINIC_A.toUpperCase())).toBe(
      cacheTags.patients(CLINIC_A),
    )
    expect(cacheTags.patient(CLINIC_A.toUpperCase(), PATIENT.toUpperCase())).toBe(
      cacheTags.patient(CLINIC_A, PATIENT),
    )
  })

  it('ignora espaco em volta da entrada', () => {
    expect(cacheTags.patients(`  ${CLINIC_A}\n`)).toBe(cacheTags.patients(CLINIC_A))
    expect(cacheTags.agenda(CLINIC_A, ' 2026-08-07 ')).toBe(
      cacheTags.agenda(CLINIC_A, '2026-08-07'),
    )
  })
})

describe('isolamento entre clinicas', () => {
  it('clinicas diferentes nunca compartilham tag', () => {
    expect(cacheTags.patients(CLINIC_A)).not.toBe(cacheTags.patients(CLINIC_B))
    expect(cacheTags.patient(CLINIC_A, PATIENT)).not.toBe(
      cacheTags.patient(CLINIC_B, PATIENT),
    )
    expect(cacheTags.agenda(CLINIC_A, '2026-08-07')).not.toBe(
      cacheTags.agenda(CLINIC_B, '2026-08-07'),
    )
  })

  it('o MESMO id de paciente em duas clinicas da duas tags', () => {
    // O cenario que o P4 existe para impedir: um id que vaze de um tenant para o
    // outro nao pode alcancar a entrada de cache do vizinho.
    const inA = cacheTags.patient(CLINIC_A, PATIENT)
    const inB = cacheTags.patient(CLINIC_B, PATIENT)

    expect(inA).not.toBe(inB)
    expect(inA.includes(CLINIC_B)).toBe(false)
    expect(inB.includes(CLINIC_A)).toBe(false)
  })

  it('ids diferentes dentro da mesma clinica dao tags diferentes', () => {
    expect(cacheTags.patient(CLINIC_A, PATIENT)).not.toBe(
      cacheTags.patient(CLINIC_A, OTHER_PATIENT),
    )
    expect(cacheTags.agenda(CLINIC_A, '2026-08-07')).not.toBe(
      cacheTags.agenda(CLINIC_A, '2026-08-08'),
    )
  })

  it('a tag de um paciente nao colide com a da listagem', () => {
    expect(cacheTags.patient(CLINIC_A, PATIENT)).not.toBe(cacheTags.patients(CLINIC_A))
  })

  it('configuracao de clinica e isolada por tenant (D3)', () => {
    /*
     * E o unico recorte CACHEADO do produto hoje — a leitura de
     * `settingsCache.ts`. Se duas clinicas compartilhassem esta tag, a
     * invalidacao de uma limparia a outra; e, pior, uma chave mal formada
     * serviria a configuracao errada.
     */
    const inA = cacheTags.clinicSettings(CLINIC_A)
    const inB = cacheTags.clinicSettings(CLINIC_B)

    expect(inA).not.toBe(inB)
    expect(inA.includes(CLINIC_A)).toBe(true)
    expect(inA.includes(CLINIC_B)).toBe(false)
  })

  it('configuracao nao colide com agenda nem com pacientes da mesma clinica', () => {
    const settings = cacheTags.clinicSettings(CLINIC_A)

    expect(settings).not.toBe(cacheTags.patients(CLINIC_A))
    expect(settings).not.toBe(cacheTags.agenda(CLINIC_A, '2026-08-07'))
  })
})

describe('clinicId obrigatorio', () => {
  it.each([
    ['vazio', ''],
    ['so espaco', '   '],
    ['quebra de linha', '\n\t'],
  ])('recusa clinicId %s', (_label, value) => {
    expect(() => cacheTags.patients(value)).toThrow(InvalidCacheTagError)
    expect(() => cacheTags.patient(value, PATIENT)).toThrow(InvalidCacheTagError)
    expect(() => cacheTags.agenda(value, '2026-08-07')).toThrow(InvalidCacheTagError)
    // Vale tambem para o unico recorte que hoje e de fato cacheado.
    expect(() => cacheTags.clinicSettings(value)).toThrow(InvalidCacheTagError)
  })

  it('recusa o que nao e string', () => {
    // A fronteira e `unknown` na pratica: a entrada pode vir de um caminho sem tipo.
    expect(() => cacheTags.patients(undefined as unknown as string)).toThrow(
      InvalidCacheTagError,
    )
    expect(() => cacheTags.patients(null as unknown as string)).toThrow(
      InvalidCacheTagError,
    )
  })

  it('recusa patientId vazio mesmo com clinica valida', () => {
    expect(() => cacheTags.patient(CLINIC_A, '  ')).toThrow(InvalidCacheTagError)
  })

  it('nomeia o parametro recusado, para o erro ser acionavel', () => {
    try {
      cacheTags.patient(CLINIC_A, '')
      expect.unreachable('deveria ter lancado')
    } catch (cause) {
      expect(cause).toBeInstanceOf(InvalidCacheTagError)
      expect((cause as InvalidCacheTagError).parameter).toBe('patientId')
    }
  })
})

describe('nenhum dado pessoal vira tag', () => {
  const PII = [
    'Maria Aparecida da Silva',
    'maria.silva@exemplo.com.br',
    '529.982.247-25',
    '11988124471',
    '1988-04-12',
  ]

  it.each(PII)('recusa %s como clinicId', (value) => {
    expect(() => cacheTags.patients(value)).toThrow(InvalidCacheTagError)
  })

  it.each(PII)('recusa %s como patientId', (value) => {
    expect(() => cacheTags.patient(CLINIC_A, value)).toThrow(InvalidCacheTagError)
  })

  it('a mensagem de erro nao repete o valor recusado', () => {
    // Se ela repetisse, o log passaria a carregar exatamente o dado que a recusa
    // existe para manter fora do cache.
    const cpf = '529.982.247-25'

    try {
      cacheTags.patient(CLINIC_A, cpf)
      expect.unreachable('deveria ter lancado')
    } catch (cause) {
      expect(String(cause)).not.toContain(cpf)
      expect(String(cause)).not.toContain('529')
    }
  })
})

describe('data da agenda', () => {
  it.each([
    ['com hora', '2026-08-07T00:00:00Z'],
    ['formato brasileiro', '07/08/2026'],
    ['sem zero a esquerda', '2026-8-7'],
    ['dia que nao existe', '2026-02-31'],
    ['mes que nao existe', '2026-13-01'],
    ['texto', 'hoje'],
  ])('recusa data %s', (_label, value) => {
    expect(() => cacheTags.agenda(CLINIC_A, value)).toThrow(InvalidCacheTagError)
  })

  it('aceita 29 de fevereiro em ano bissexto', () => {
    expect(cacheTags.agenda(CLINIC_A, '2028-02-29')).toBe(
      `clinic:${CLINIC_A}:agenda:2028-02-29`,
    )
  })
})
