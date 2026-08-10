import { describe, expect, it } from 'vitest'

import {
  archiveRoomSchema,
  createRoomSchema,
  toggleRoomActiveSchema,
  updateRoomSchema,
} from './room.schema'

/**
 * O contrato de entrada das salas.
 *
 * Reaplicado no servidor mesmo com a tela já validando — é o que separa "a UI
 * pede direito" de "o servidor exige". Quem chama a Server Action direto não
 * passa pelo formulário.
 *
 * O que NÃO está aqui é metade do teste: **nenhum schema aceita `clinicId`**.
 * O tenant sai de `current_clinic_id()` no `createAction`, e um campo desses no
 * schema daria ao navegador a chance de escolher a clínica.
 */

const VALID_ID = '9019956f-bdd8-4d61-868d-09b02332dad0'

describe('createRoomSchema', () => {
  it('aceita o caso mínimo e aplica os padrões', () => {
    const parsed = createRoomSchema.parse({
      name: 'Consultório 1',
      kind: 'consultorio',
    })

    expect(parsed).toEqual({
      name: 'Consultório 1',
      kind: 'consultorio',
      capacity: null,
      notes: '',
    })
  })

  it('remove espaços das pontas do nome', () => {
    // Sem isto, "Sala 1" e " Sala 1" seriam nomes diferentes para o índice
    // único — e a tela mostraria duas linhas que a pessoa lê como iguais.
    expect(createRoomSchema.parse({ name: '  Sala 1  ', kind: 'consultorio' }).name).toBe(
      'Sala 1',
    )
  })

  it('recusa nome de uma letra', () => {
    const result = createRoomSchema.safeParse({ name: 'A', kind: 'consultorio' })

    expect(result.success).toBe(false)
  })

  it('recusa nome que só tem espaço', () => {
    // O `trim` roda ANTES do `min`, então "   " chega como string vazia.
    expect(
      createRoomSchema.safeParse({ name: '   ', kind: 'consultorio' }).success,
    ).toBe(false)
  })

  it('recusa tipo que não existe no enum do banco', () => {
    /*
     * `kind` vira a coluna `room_kind`. Um valor fora do enum passaria pela
     * aplicação e morreria no Postgres com `22P02` — erro de driver, sem
     * mensagem que ajude quem preencheu.
     */
    expect(
      createRoomSchema.safeParse({ name: 'Sala', kind: 'sala_de_espera' }).success,
    ).toBe(false)
  })

  it('capacidade aceita nulo, e é o padrão', () => {
    // Equipamento não tem capacidade: nulo é resposta legítima, não ausência.
    expect(
      createRoomSchema.parse({ name: 'Ultrassom', kind: 'equipamento' }).capacity,
    ).toBeNull()
  })

  it('recusa capacidade zero, negativa e fracionada', () => {
    for (const capacity of [0, -1, 2.5]) {
      const result = createRoomSchema.safeParse({
        name: 'Sala',
        kind: 'consultorio',
        capacity,
      })

      expect(result.success, String(capacity)).toBe(false)
    }
  })

  it('recusa capacidade acima do teto', () => {
    expect(
      createRoomSchema.safeParse({
        name: 'Sala',
        kind: 'consultorio',
        capacity: 1000,
      }).success,
    ).toBe(false)
  })

  it('recusa observação longa demais', () => {
    expect(
      createRoomSchema.safeParse({
        name: 'Sala',
        kind: 'consultorio',
        notes: 'x'.repeat(501),
      }).success,
    ).toBe(false)
  })

  it('não aceita clinicId vindo do cliente', () => {
    /*
     * P3: o tenant nunca vem do navegador. Zod descarta a chave desconhecida
     * em vez de repassá-la — e é a ausência dela no resultado que garante que
     * o handler nunca a veja.
     */
    const parsed = createRoomSchema.parse({
      name: 'Sala',
      kind: 'consultorio',
      clinicId: 'clinica-de-outra-pessoa',
    })

    expect(parsed).not.toHaveProperty('clinicId')
  })
})

describe('updateRoomSchema', () => {
  it('exige um id em forma de UUID', () => {
    expect(
      updateRoomSchema.safeParse({
        roomId: 'nao-e-uuid',
        name: 'Sala',
        kind: 'consultorio',
      }).success,
    ).toBe(false)
  })

  it('herda as mesmas regras da criação', () => {
    const result = updateRoomSchema.safeParse({
      roomId: VALID_ID,
      name: 'A',
      kind: 'consultorio',
    })

    expect(result.success).toBe(false)
  })

  it('não deixa mexer em is_active por aqui', () => {
    /*
     * Ativar e desativar tem action própria, com auditoria própria. Se o
     * formulário de edição pudesse mandar `isActive`, a mesma mudança teria
     * dois caminhos e um deles registraria o evento errado.
     */
    const parsed = updateRoomSchema.parse({
      roomId: VALID_ID,
      name: 'Sala',
      kind: 'consultorio',
      isActive: false,
    })

    expect(parsed).not.toHaveProperty('isActive')
  })
})

describe('toggleRoomActiveSchema', () => {
  it('exige booleano de verdade', () => {
    // `'false'` como string é o que um formulário HTML manda se ninguém
    // converter — e ele é *truthy*, o que ativaria a sala em vez de desativar.
    expect(
      toggleRoomActiveSchema.safeParse({ roomId: VALID_ID, isActive: 'false' })
        .success,
    ).toBe(false)
  })

  it('aceita os dois sentidos', () => {
    for (const isActive of [true, false]) {
      expect(
        toggleRoomActiveSchema.safeParse({ roomId: VALID_ID, isActive }).success,
      ).toBe(true)
    }
  })
})

describe('archiveRoomSchema', () => {
  it('pede só o id, e ele precisa ser UUID', () => {
    expect(archiveRoomSchema.parse({ roomId: VALID_ID })).toEqual({
      roomId: VALID_ID,
    })
    expect(archiveRoomSchema.safeParse({ roomId: '' }).success).toBe(false)
  })
})
