import { describe, expect, it } from 'vitest'

import type { Room } from '../domain/Room'
import { toRoomDto, toRoomGroups } from './toRoomDto'

/**
 * O agrupamento que vivia dentro do componente.
 *
 * Até 10/08/2026 ele era um `reduce` em `RoomsScreen`, com a ordem saindo de um
 * campo `order` dentro do mapa de rótulos — enquanto o JSDoc de
 * `RoomsScreen.props.ts` afirmava "já agrupadas e ordenadas **pela rota**".
 * A rota só chamava `map(toRoomDto)`.
 *
 * A frase errada não custava render nenhum. Custava a próxima pessoa, que leria
 * o contrato e passaria uma lista já ordenada esperando que fosse respeitada —
 * e a ordem dela seria descartada em silêncio.
 */

function room(overrides: Partial<Room> & { id: string; name: string }): Room {
  const now = new Date('2026-08-10T12:00:00.000Z')

  return {
    clinicId: 'clinic-1',
    kind: 'consultorio',
    capacity: null,
    notes: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('toRoomDto', () => {
  it('não carrega o tenant para a tela', () => {
    /*
     * `clinicId` fica fora do DTO de propósito: a tela nunca precisa dele, e o
     * que não atravessa a fronteira não pode ser reenviado por engano numa
     * escrita — que é como um id de tenant vindo do cliente entraria no
     * produto.
     */
    const dto = toRoomDto(room({ id: 'r1', name: 'Consultório 1' }))

    expect(dto).not.toHaveProperty('clinicId')
    expect(dto).not.toHaveProperty('createdAt')
    expect(dto.id).toBe('r1')
  })
})

describe('toRoomGroups', () => {
  it('agrupa por tipo na ordem do domínio', () => {
    const groups = toRoomGroups([
      room({ id: 'e1', name: 'Ultrassom', kind: 'equipamento' }),
      room({ id: 'c1', name: 'Consultório 1', kind: 'consultorio' }),
      room({ id: 'x1', name: 'Sala de exames', kind: 'sala_exame' }),
    ])

    expect(groups.map((group) => group.kind)).toEqual([
      'consultorio',
      'sala_exame',
      'equipamento',
    ])
  })

  it('não monta grupo vazio', () => {
    /*
     * Uma clínica sem equipamento não precisa ver o cabeçalho "Equipamentos"
     * com nada embaixo: seção vazia se lê como coisa quebrada, não como
     * ausência.
     */
    const groups = toRoomGroups([room({ id: 'c1', name: 'Consultório 1' })])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('consultorio')
  })

  it('lista vazia devolve nenhum grupo', () => {
    expect(toRoomGroups([])).toEqual([])
  })

  it('ativas antes das inativas, dentro do grupo', () => {
    /*
     * A ordem alfabética sozinha misturaria a sala em reforma entre as que
     * funcionam. Quem abre esta tela para marcar alguém precisa das
     * disponíveis à vista.
     */
    const [group] = toRoomGroups([
      room({ id: 'a', name: 'Aurora', isActive: false }),
      room({ id: 'z', name: 'Zenite', isActive: true }),
    ])

    expect(group.rooms.map((item) => item.name)).toEqual(['Zenite', 'Aurora'])
  })

  it('desempata por nome, com as regras do português', () => {
    // `localeCompare` padrão põe "Área" depois de "Zenite" por causa do acento.
    const [group] = toRoomGroups([
      room({ id: 'z', name: 'Zenite' }),
      room({ id: 'a', name: 'Área externa' }),
      room({ id: 'l', name: 'Ala norte' }),
    ])

    expect(group.rooms.map((item) => item.name)).toEqual([
      'Ala norte',
      'Área externa',
      'Zenite',
    ])
  })

  it('nenhuma sala se perde no agrupamento', () => {
    const todas = [
      room({ id: '1', name: 'A', kind: 'consultorio' }),
      room({ id: '2', name: 'B', kind: 'sala_exame' }),
      room({ id: '3', name: 'C', kind: 'sala_procedimento' }),
      room({ id: '4', name: 'D', kind: 'equipamento' }),
      room({ id: '5', name: 'E', kind: 'consultorio', isActive: false }),
    ]

    const total = toRoomGroups(todas).reduce(
      (count, group) => count + group.rooms.length,
      0,
    )

    expect(total).toBe(todas.length)
  })

  it('não altera a lista recebida', () => {
    /*
     * `sort` muda o array no lugar. Sem a cópia, agrupar reordenaria a lista da
     * rota — e o próximo uso dela veria uma ordem que ninguém pediu.
     */
    const entrada = [
      room({ id: 'z', name: 'Zenite' }),
      room({ id: 'a', name: 'Ala norte' }),
    ]

    toRoomGroups(entrada)

    expect(entrada.map((item) => item.name)).toEqual(['Zenite', 'Ala norte'])
  })
})
