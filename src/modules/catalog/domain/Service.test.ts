import { describe, expect, it } from 'vitest'

import {
  categoriesOf,
  DEFAULT_CATALOG_FILTERS,
  filterCatalog,
  findSameCode,
  normalizeCode,
  sortForCatalog,
  type Service,
} from './Service'

function service(patch: Partial<Service> = {}): Service {
  return {
    id: 's1',
    code: 'CONS01',
    tussCode: '10101012',
    name: 'Consulta clínica',
    description: null,
    category: 'Consultas',
    defaultDurationMinutes: 30,
    defaultPriceCents: 25_000,
    requiresAuthorization: false,
    isActive: true,
    updatedAt: new Date('2026-08-10T10:00:00.000Z'),
    ...patch,
  }
}

/**
 * Código repetido é ambiguidade na fatura.
 *
 * O código liga o serviço ao que o convênio e o financeiro entendem. Dois
 * serviços com o mesmo código deixam quem fatura sem saber qual valor vale.
 */
describe('código repetido', () => {
  it('ignora caixa e espaço, que é como a digitação varia', () => {
    const catalogo = [service()]

    expect(findSameCode(catalogo, 'cons01')).toBeTruthy()
    expect(findSameCode(catalogo, '  CONS01  ')).toBeTruthy()
  })

  it('nome repetido é permitido — só o código não', () => {
    /*
     * "Consulta" e "Consulta (retorno)" convivem, e até dois serviços com o
     * mesmo nome podem existir enquanto os códigos os distinguirem.
     */
    const catalogo = [service({ code: 'A' }), service({ id: 's2', code: 'B' })]

    expect(findSameCode(catalogo, 'C')).toBeNull()
  })

  it('serviço sem código nunca colide', () => {
    // Código é opcional; dois nulos não são "o mesmo código".
    const catalogo = [service({ code: null }), service({ id: 's2', code: null })]

    expect(findSameCode(catalogo, null)).toBeNull()
    expect(findSameCode(catalogo, 'CONS01')).toBeNull()
  })

  it('a própria linha não conta como duplicata', () => {
    // Trocar "cons01" por "CONS01" não pode colidir consigo mesma.
    const catalogo = [service({ id: 's1', code: 'CONS01' })]

    expect(findSameCode(catalogo, 'cons01', 's1')).toBeNull()
    expect(findSameCode(catalogo, 'cons01', 's2')).toBeTruthy()
  })

  it('normalizar é para comparar, não para gravar', () => {
    expect(normalizeCode('  cons01 ')).toBe('CONS01')
  })
})

describe('ordem do catálogo', () => {
  it('ativos primeiro, depois alfabética', () => {
    const ordered = sortForCatalog([
      service({ id: 'z-ativo', name: 'Zumbido', isActive: true }),
      service({ id: 'a-inativo', name: 'Avaliação', isActive: false }),
      service({ id: 'a-ativo', name: 'Avaliação', isActive: true }),
    ])

    expect(ordered.map((item) => item.id)).toEqual(['a-ativo', 'z-ativo', 'a-inativo'])
  })

  it('respeita acento na comparação', () => {
    const ordered = sortForCatalog([
      service({ id: 'u', name: 'Ultrassom' }),
      service({ id: 'a', name: 'Área técnica' }),
    ])

    expect(ordered.map((item) => item.id)).toEqual(['a', 'u'])
  })

  it('não muda a lista recebida', () => {
    const original = [service({ id: 'b', isActive: false }), service({ id: 'a' })]

    sortForCatalog(original)

    expect(original.map((item) => item.id)).toEqual(['b', 'a'])
  })
})

describe('filtros', () => {
  const catalogo = [
    service({ id: 'consulta', name: 'Consulta clínica', code: 'CONS01', category: 'Consultas' }),
    service({ id: 'exame', name: 'Ultrassom', code: 'USG10', tussCode: '40901114', category: 'Exames' }),
    service({ id: 'antigo', name: 'Consulta antiga', code: 'OLD', category: 'Consultas', isActive: false }),
  ]

  it('por padrão mostra só os ativos', () => {
    const visible = filterCatalog(catalogo, DEFAULT_CATALOG_FILTERS)

    expect(visible.map((item) => item.id)).toEqual(['consulta', 'exame'])
  })

  it('busca alcança nome, código interno e TUSS', () => {
    /*
     * Quem fatura procura pelo código; quem agenda procura pelo nome. Uma busca
     * só por nome obrigaria o financeiro a decorar a nomenclatura da recepção.
     */
    const byName = filterCatalog(catalogo, { ...DEFAULT_CATALOG_FILTERS, query: 'ultras' })
    const byCode = filterCatalog(catalogo, { ...DEFAULT_CATALOG_FILTERS, query: 'usg10' })
    const byTuss = filterCatalog(catalogo, { ...DEFAULT_CATALOG_FILTERS, query: '40901114' })

    expect(byName.map((item) => item.id)).toEqual(['exame'])
    expect(byCode.map((item) => item.id)).toEqual(['exame'])
    expect(byTuss.map((item) => item.id)).toEqual(['exame'])
  })

  it('filtra por categoria', () => {
    const visible = filterCatalog(catalogo, {
      ...DEFAULT_CATALOG_FILTERS,
      category: 'Exames',
    })

    expect(visible.map((item) => item.id)).toEqual(['exame'])
  })

  it('mostrar todos inclui os desativados', () => {
    const visible = filterCatalog(catalogo, {
      ...DEFAULT_CATALOG_FILTERS,
      onlyActive: false,
    })

    expect(visible).toHaveLength(3)
  })

  it('busca e situação se combinam', () => {
    const visible = filterCatalog(catalogo, {
      query: 'consulta',
      category: 'all',
      onlyActive: false,
    })

    expect(visible.map((item) => item.id)).toEqual(['consulta', 'antigo'])
  })
})

describe('categorias', () => {
  it('vêm do que está cadastrado — nunca de uma lista inventada', () => {
    /*
     * Uma lista fixa de categorias ("Consultas", "Exames", "Procedimentos")
     * seria uma taxonomia que o produto impõe a clínicas que já têm a delas.
     */
    const found = categoriesOf([
      service({ category: 'Exames' }),
      service({ category: 'Consultas' }),
      service({ category: 'Consultas' }),
      service({ category: null }),
    ])

    expect(found).toEqual(['Consultas', 'Exames'])
  })

  it('catálogo sem categoria devolve lista vazia', () => {
    expect(categoriesOf([service({ category: null })])).toEqual([])
  })
})
