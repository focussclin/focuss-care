import { describe, expect, it } from 'vitest'

import { createAppointmentSchema } from './appointment.schema'

/**
 * O vínculo com a sala, no contrato de entrada.
 *
 * A propriedade que este arquivo protege é uma só: **marcar sem sala continua
 * funcionando exatamente como antes**. Toda clínica que não controla sala, e
 * todo atendimento criado antes desta fatia, dependem disso.
 *
 * O caso que mais engana é a string vazia. Um `<select>` manda `''` quando a
 * opção "Sem sala definida" está escolhida — que é a opção padrão, ou seja, a
 * mais comum de todas. Se `''` chegasse ao banco como `room_id`, o Postgres o
 * recusaria por não ser UUID, e marcar consulta pararia de funcionar para quem
 * não usa salas.
 */

const base = {
  patientId: '11111111-1111-4111-8111-111111111111',
  professionalId: '22222222-2222-4222-8222-222222222222',
  type: 'Consulta',
  date: '2026-08-20',
  time: '09:00',
  durationMinutes: 30,
  status: 'scheduled' as const,
}

const ROOM = '33333333-3333-4333-8333-333333333333'

describe('roomId na criação de atendimento', () => {
  it('ausente vira null — o caminho de quem não usa sala', () => {
    const parsed = createAppointmentSchema.parse(base)

    expect(parsed.roomId).toBeNull()
  })

  it('string vazia vira null, e não erro de UUID', () => {
    // A opção padrão do `<select>`. Sem esta linha, a escolha mais comum de
    // todas seria recusada.
    const parsed = createAppointmentSchema.parse({ ...base, roomId: '' })

    expect(parsed.roomId).toBeNull()
  })

  it('null explícito continua null', () => {
    expect(createAppointmentSchema.parse({ ...base, roomId: null }).roomId).toBeNull()
  })

  it('uuid válido atravessa', () => {
    expect(createAppointmentSchema.parse({ ...base, roomId: ROOM }).roomId).toBe(
      ROOM,
    )
  })

  it('texto que não é uuid é recusado', () => {
    /*
     * Não é preciosismo: `room_id` é FK para `rooms(id)`. Um valor qualquer
     * morreria no Postgres com `22P02` — erro de driver, sem mensagem que
     * ajude quem preencheu.
     */
    const result = createAppointmentSchema.safeParse({
      ...base,
      roomId: 'sala-1',
    })

    expect(result.success).toBe(false)
  })

  it('a sala não interfere no resto do contrato', () => {
    // Guarda contra o `transform` final esquecer um campo ao ganhar mais um.
    const parsed = createAppointmentSchema.parse({ ...base, roomId: ROOM })

    expect(parsed).toMatchObject({
      patientId: base.patientId,
      professionalId: base.professionalId,
      reason: 'Consulta',
      status: 'scheduled',
      roomId: ROOM,
    })
    expect(parsed.startsAt).toBeInstanceOf(Date)
    expect(parsed.endsAt).toBeInstanceOf(Date)
  })
})
