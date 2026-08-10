import { describe, expect, it } from 'vitest'

import {
  availableServices,
  findSameService,
  isInEffect,
  isValidWindow,
  sortItems,
  sortPriceLists,
  type PriceListItem,
} from './PriceList'

function item(patch: Partial<PriceListItem> = {}): PriceListItem {
  return {
    id: 'i1',
    serviceId: 's1',
    serviceName: 'Consulta clínica',
    serviceCode: 'CONS01',
    priceCents: 25_000,
    ...patch,
  }
}

describe('vigência', () => {
  it('janela invertida não vale', () => {
    /*
     * Invertida, a tabela nunca vale — e nada na tela denunciaria isso, porque
     * as duas datas são plausíveis isoladas.
     */
    expect(
      isValidWindow(new Date('2026-12-01'), new Date('2026-01-01')),
    ).toBe(false)
    expect(isValidWindow(new Date('2026-01-01'), new Date('2026-12-01'))).toBe(true)
  })

  it('sem datas, a janela é sempre válida', () => {
    expect(isValidWindow(null, null)).toBe(true)
    expect(isValidWindow(new Date('2026-01-01'), null)).toBe(true)
  })

  it('tabela dentro da janela está valendo', () => {
    const agora = new Date('2026-08-10T12:00:00.000Z')

    expect(
      isInEffect(
        { validFrom: new Date('2026-01-01'), validUntil: new Date('2026-12-31') },
        agora,
      ),
    ).toBe(true)
  })

  it('fora da janela não está valendo — mas continua existindo', () => {
    /*
     * `isInEffect` responde se vale HOJE. A tabela vencida continua na lista:
     * quem fatura um atendimento antigo precisa dela.
     */
    const agora = new Date('2026-08-10T12:00:00.000Z')

    expect(
      isInEffect({ validFrom: null, validUntil: new Date('2026-01-01') }, agora),
    ).toBe(false)
    expect(
      isInEffect({ validFrom: new Date('2027-01-01'), validUntil: null }, agora),
    ).toBe(false)
  })

  it('sem vigência declarada, vale sempre', () => {
    expect(isInEffect({ validFrom: null, validUntil: null }, new Date())).toBe(true)
  })
})

/**
 * Serviço repetido na mesma tabela é ambiguidade de preço.
 *
 * Entre tabelas diferentes é o contrário: é para isso que elas existem.
 */
describe('serviço repetido', () => {
  it('acha o item do mesmo serviço', () => {
    expect(findSameService([item()], 's1')).toBeTruthy()
    expect(findSameService([item()], 's2')).toBeNull()
  })

  it('a própria linha não conta', () => {
    // Editar o preço de um item não pode colidir consigo mesmo.
    expect(findSameService([item({ id: 'i1' })], 's1', 'i1')).toBeNull()
    expect(findSameService([item({ id: 'i1' })], 's1', 'i2')).toBeTruthy()
  })

  it('só oferece serviços ainda não precificados', () => {
    /*
     * Oferecer um serviço que já tem preço abriria a porta para o segundo item,
     * que é justamente o que não pode existir.
     */
    const servicos = [{ id: 's1' }, { id: 's2' }, { id: 's3' }]

    expect(availableServices(servicos, [item({ serviceId: 's1' })]).map((s) => s.id)).toEqual([
      's2',
      's3',
    ])
  })

  it('tabela vazia oferece tudo', () => {
    expect(availableServices([{ id: 's1' }], []).map((s) => s.id)).toEqual(['s1'])
  })
})

describe('ordem', () => {
  it('padrão primeiro, depois ativas, depois alfabética', () => {
    const ordered = sortPriceLists([
      { name: 'Zebra', isDefault: false, isActive: true },
      { name: 'Antiga', isDefault: false, isActive: false },
      { name: 'Particular', isDefault: true, isActive: true },
      { name: 'Aurora', isDefault: false, isActive: true },
    ])

    expect(ordered.map((l) => l.name)).toEqual(['Particular', 'Aurora', 'Zebra', 'Antiga'])
  })

  it('itens em ordem alfabética de serviço — é como se procura um preço', () => {
    const ordered = sortItems([
      { serviceName: 'Ultrassom' },
      { serviceName: 'Área técnica' },
    ])

    expect(ordered.map((i) => i.serviceName)).toEqual(['Área técnica', 'Ultrassom'])
  })

  it('não muda a lista recebida', () => {
    const original = [
      { name: 'B', isDefault: false, isActive: true },
      { name: 'A', isDefault: true, isActive: true },
    ]

    sortPriceLists(original)

    expect(original.map((l) => l.name)).toEqual(['B', 'A'])
  })
})
