import { describe, expect, it } from 'vitest'

import { ROOM_KIND_ORDER, type RoomKind } from './Room'

/**
 * O domínio de salas é quase todo tipo — e a única constante dele é a que
 * decide o que a clínica vê primeiro.
 *
 * O teste que importa aqui não é sobre a ordem em si (ela é escolha de produto,
 * e mudá-la é legítimo): é sobre a ordem continuar **completa**. Um tipo novo no
 * enum `room_kind` que não entre em `ROOM_KIND_ORDER` some da tela sem erro
 * nenhum — `toRoomGroups` percorre a ordem, não a lista, então o grupo
 * simplesmente nunca é montado.
 */

/*
 * Lista escrita à mão, e não derivada de `ROOM_KIND_ORDER`.
 *
 * Derivá-la faria o teste comparar a constante consigo mesma e passar sempre.
 * O TypeScript é a outra metade da guarda: `satisfies` quebra se um membro do
 * union sumir daqui, e o `toEqual` abaixo quebra se ele sumir de lá.
 */
const TODOS_OS_TIPOS = [
  'consultorio',
  'sala_exame',
  'sala_procedimento',
  'equipamento',
] as const satisfies readonly RoomKind[]

describe('ROOM_KIND_ORDER', () => {
  it('cobre todos os tipos de recurso', () => {
    expect([...ROOM_KIND_ORDER].sort()).toEqual([...TODOS_OS_TIPOS].sort())
  })

  it('não repete nenhum tipo', () => {
    // Repetido faria o grupo aparecer duas vezes, com o mesmo conteúdo.
    expect(new Set(ROOM_KIND_ORDER).size).toBe(ROOM_KIND_ORDER.length)
  })

  it('começa por consultório e termina em equipamento', () => {
    /*
     * A única parte da ordem que é decisão registrada: consultório primeiro
     * porque é o que a clínica configura primeiro e tem em maior número;
     * equipamento por último porque é o único que não é um lugar.
     */
    expect(ROOM_KIND_ORDER[0]).toBe('consultorio')
    expect(ROOM_KIND_ORDER[ROOM_KIND_ORDER.length - 1]).toBe('equipamento')
  })
})
