import { describe, expect, it } from 'vitest'

import type { Room } from '../domain/Room'
import { RoomRepositoryError } from '../domain/RoomRepositoryError'
import { resolveRoomContext } from './roomContext'

/**
 * A decisão que a rota da Agenda tomava inline — e errava em silêncio.
 *
 * # Os dois defeitos que estes testes prendem
 *
 * **1. `schemaReady` derivado de `rooms.length`.** Uma clínica que aplicou a
 * migration e desativou todas as salas tem a lista vazia com a coluna
 * existindo. Decidir pelo tamanho fazia o `select` da agenda omitir `room_id`,
 * e os atendimentos que JÁ tinham sala perdiam o nome dela na grade —
 * histórico apagado da tela por causa do estado presente do cadastro.
 *
 * **2. O `catch` engolindo toda `RoomRepositoryError`.** "A RLS recusou" e "o
 * banco não respondeu" viravam "esta clínica não tem salas": a mesma tela, sem
 * erro em lugar nenhum, e ninguém investigando uma policy quebrada porque nada
 * reclamou.
 *
 * Nenhum dos dois quebrava teste, tela ou build. É por isso que a decisão saiu
 * da rota: aqui ela é verificável sem banco, sem rede e sem mock.
 */

function room(overrides: Partial<Room> & { id: string }): Room {
  const now = new Date('2026-08-10T12:00:00.000Z')

  return {
    clinicId: 'clinic-1',
    name: `Sala ${overrides.id}`,
    kind: 'consultorio',
    capacity: null,
    notes: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

const loaded = (rooms: readonly Room[]) => ({ status: 'loaded' as const, rooms })
const failed = (cause: unknown) => ({ status: 'failed' as const, cause })

describe('leitura bem-sucedida', () => {
  it('oferece só as salas ativas', () => {
    const context = resolveRoomContext(
      loaded([
        room({ id: '1' }),
        room({ id: '2', isActive: false }),
        room({ id: '3' }),
      ]),
    )

    expect(context.rooms.map((item) => item.id)).toEqual(['1', '3'])
  })

  it('o schema está pronto mesmo sem NENHUMA sala ativa', () => {
    /*
     * O bug que originou esta função. Reforma, mudança de endereço: a clínica
     * desativa tudo, a lista fica vazia, e a coluna continua lá.
     *
     * Com `schemaReady` derivado do tamanho, o `select` da agenda passaria a
     * omitir `room_id` e os atendimentos históricos perderiam a sala na grade.
     */
    const context = resolveRoomContext(
      loaded([room({ id: '1', isActive: false })]),
    )

    expect(context.rooms).toEqual([])
    expect(context.schemaReady).toBe(true)
  })

  it('clínica que nunca cadastrou sala também tem schema pronto', () => {
    // Lista vazia é resposta legítima da tabela existente, não ausência dela.
    expect(resolveRoomContext(loaded([])).schemaReady).toBe(true)
  })

  it('preserva a ordem que o repositório devolveu', () => {
    // O adapter já ordena por tipo e nome. Reordenar aqui seria uma segunda
    // opinião sobre a mesma coisa.
    const context = resolveRoomContext(
      loaded([room({ id: 'z' }), room({ id: 'a' }), room({ id: 'm' })]),
    )

    expect(context.rooms.map((item) => item.id)).toEqual(['z', 'a', 'm'])
  })

  it('não altera a lista recebida', () => {
    const entrada = [room({ id: '1' }), room({ id: '2', isActive: false })]

    resolveRoomContext(loaded(entrada))

    expect(entrada).toHaveLength(2)
  })
})

describe('falha absorvida', () => {
  it('schema-not-ready vira lista vazia e schemaReady falso', () => {
    /*
     * A única falha que a agenda deve absorver: não é falha, é um recurso que
     * ainda não existe — `20260809_rooms.sql` não foi aplicada — sobre uma tela
     * que funciona há meses sem ele.
     */
    const context = resolveRoomContext(
      failed(new RoomRepositoryError('schema-not-ready', 'tabela ausente')),
    )

    expect(context).toEqual({ rooms: [], schemaReady: false })
  })
})

describe('falhas que SOBEM', () => {
  it.each(['forbidden', 'unavailable', 'unexpected', 'conflict', 'not-found'] as const)(
    '%s é relançado',
    (reason) => {
      expect(() =>
        resolveRoomContext(failed(new RoomRepositoryError(reason, 'recusado'))),
      ).toThrow(RoomRepositoryError)
    },
  )

  it('relança a causa ORIGINAL, e não uma nova', () => {
    /*
     * Identidade, e não só o tipo. O error boundary registra `error.digest`
     * para ligar a tela ao log do servidor; embrulhar a causa numa exceção nova
     * quebraria esse fio — e a investigação perderia o rastro exatamente no
     * caso em que ela é necessária.
     */
    const original = new RoomRepositoryError('forbidden', 'policy recusou', '42501')

    expect(() => resolveRoomContext(failed(original))).toThrow(original)
  })

  it('erro que não é do repositório também sobe', () => {
    // Falha de programação — `undefined is not a function` — não pode virar
    // "esta clínica não tem salas".
    const bug = new TypeError('quebrou antes de chegar ao banco')

    expect(() => resolveRoomContext(failed(bug))).toThrow(bug)
  })

  it('causa que nem é Error sobe do mesmo jeito', () => {
    expect(() => resolveRoomContext(failed('string solta'))).toThrow(
      'string solta',
    )
  })
})
