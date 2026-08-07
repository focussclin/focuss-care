import { describe, expect, it } from 'vitest'

import {
  PATIENT_PAGE_DEFAULT_SIZE,
  PATIENT_PAGE_MAX_SIZE,
  PATIENT_SEARCH_MAX_LENGTH,
  parsePatientListQuery,
  patientListHref,
  sanitizePatientSearch,
} from './patientQuery.schema'

describe('sanitizePatientSearch', () => {
  it('devolve null para o que nao e busca', () => {
    expect(sanitizePatientSearch(undefined)).toBeNull()
    expect(sanitizePatientSearch(null)).toBeNull()
    expect(sanitizePatientSearch(42)).toBeNull()
    expect(sanitizePatientSearch('')).toBeNull()
    expect(sanitizePatientSearch('    ')).toBeNull()
  })

  it('remove os curingas do ILIKE em vez de escapa-los', () => {
    // O PostgREST nao expoe a clausula ESCAPE do LIKE: escapar e impossivel.
    // Quem digita "100%" procura por "100", nao por "qualquer coisa".
    expect(sanitizePatientSearch('100%')).toBe('100')
    expect(sanitizePatientSearch('a_b')).toBe('ab')
    expect(sanitizePatientSearch('%%%')).toBeNull()
  })

  it('remove o que muda a gramatica do filtro do PostgREST', () => {
    const dirty = 'a,b)or(c.d:e;f&g|h"i\'j\\k/l'
    const clean = sanitizePatientSearch(dirty)

    expect(clean).not.toBeNull()
    for (const char of [',', '(', ')', ':', ';', '&', '|', '"', "'", '\\', '/']) {
      expect(clean).not.toContain(char)
    }
  })

  it('preserva o ponto, o arroba e o hifen — e-mail e nome composto dependem deles', () => {
    expect(sanitizePatientSearch('maria.souza@email.com')).toBe(
      'maria.souza@email.com',
    )
    expect(sanitizePatientSearch('Ana-Clara D Ávila')).toBe('Ana-Clara D Ávila')
  })

  it('descarta caracteres de controle e invisiveis', () => {
    const withControl = `ana${String.fromCharCode(0)}${String.fromCharCode(
      27,
    )}maria${String.fromCharCode(8203)}`

    const clean = sanitizePatientSearch(withControl)

    expect(clean).toBe('ana maria')
  })

  it('corta o termo no teto e normaliza o espaco', () => {
    expect(sanitizePatientSearch('  ana    maria  ')).toBe('ana maria')
    expect(sanitizePatientSearch('a'.repeat(500))).toHaveLength(
      PATIENT_SEARCH_MAX_LENGTH,
    )
  })

  it('e idempotente — sanitizar duas vezes da o mesmo resultado', () => {
    const once = sanitizePatientSearch('Silva, (Maria) 100%')
    expect(sanitizePatientSearch(once)).toBe(once)
  })

  it('deixa emoji passar sem quebrar', () => {
    expect(() => sanitizePatientSearch('ana 🙂')).not.toThrow()
  })
})

describe('parsePatientListQuery', () => {
  it('sem parametros, devolve o recorte padrao', () => {
    expect(parsePatientListQuery({})).toEqual({
      search: null,
      status: 'all',
      cursor: null,
      limit: PATIENT_PAGE_DEFAULT_SIZE,
    })
  })

  it('nunca lanca, por pior que seja a URL', () => {
    expect(() =>
      parsePatientListQuery({
        q: { nao: 'e string' },
        status: 'sudo',
        cursor: 12345,
        limit: [],
        extra: 'ignorado',
      }),
    ).not.toThrow()

    expect(
      parsePatientListQuery({ status: 'sudo', limit: 'abc' }),
    ).toEqual({
      search: null,
      status: 'all',
      cursor: null,
      limit: PATIENT_PAGE_DEFAULT_SIZE,
    })
  })

  it('clampa o limite no teto do servidor', () => {
    // O vetor: `?limit=100000` baixaria a clinica inteira numa requisicao.
    expect(parsePatientListQuery({ limit: '1000' }).limit).toBe(
      PATIENT_PAGE_MAX_SIZE,
    )
    expect(parsePatientListQuery({ limit: '100000' }).limit).toBe(
      PATIENT_PAGE_MAX_SIZE,
    )
    expect(parsePatientListQuery({ limit: '25' }).limit).toBe(25)
  })

  it('trata limite sem sentido como ausencia de pedido', () => {
    for (const limit of ['0', '-1', 'abc', '', 'NaN', 'Infinity']) {
      expect(parsePatientListQuery({ limit }).limit).toBe(
        PATIENT_PAGE_DEFAULT_SIZE,
      )
    }
  })

  it('aceita apenas os tres status conhecidos', () => {
    expect(parsePatientListQuery({ status: 'active' }).status).toBe('active')
    expect(parsePatientListQuery({ status: 'inactive' }).status).toBe('inactive')
    expect(parsePatientListQuery({ status: 'follow-up' }).status).toBe('all')
  })

  it('sanitiza o termo antes de ele virar query', () => {
    expect(parsePatientListQuery({ q: '  Ana%  ' }).search).toBe('Ana')
    expect(parsePatientListQuery({ q: '   ' }).search).toBeNull()
  })

  it('usa o primeiro valor quando o parametro vem repetido', () => {
    expect(parsePatientListQuery({ q: ['ana', 'bruno'] }).search).toBe('ana')
    expect(parsePatientListQuery({ status: ['inactive', 'active'] }).status).toBe(
      'inactive',
    )
  })

  it('descarta cursor absurdamente longo', () => {
    expect(parsePatientListQuery({ cursor: 'A'.repeat(5000) }).cursor).toBeNull()
  })
})

describe('patientListHref', () => {
  it('omite o que e padrao', () => {
    expect(patientListHref({ search: null, status: 'all' })).toBe('/pacientes')
  })

  it('leva termo, status e cursor', () => {
    expect(
      patientListHref({ search: 'ana maria', status: 'inactive' }, 'CURSOR'),
    ).toBe('/pacientes?q=ana+maria&status=inactive&cursor=CURSOR')
  })

  it('descarta o cursor quando o filtro muda', () => {
    // A regra: cursor e posicao dentro de UM resultado. Levado para outro
    // recorte, ele salta linhas em silencio.
    expect(patientListHref({ search: 'ana', status: 'all' })).toBe(
      '/pacientes?q=ana',
    )
  })
})
