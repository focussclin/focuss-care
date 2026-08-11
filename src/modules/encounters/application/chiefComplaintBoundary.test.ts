import { describe, expect, it } from 'vitest'

import type { Encounter } from '../domain/Encounter'
import { canRecordChiefComplaint } from '../domain/Encounter'
import { toEncounterDto } from './toEncounterDto'

/**
 * A queixa principal na FRONTEIRA — feature **E-03**.
 *
 * `/atendimentos` é operada pela recepção, e a queixa é conteúdo clínico. O que
 * um papel não pode ver **não atravessa a Server Action** — não é escondido na
 * tela. É o mesmo desenho de `toServiceDto(service, canSeePrice)`, e o motivo é
 * o mesmo: esconder na tela deixa o texto no payload, alcançável por qualquer um
 * que abra as ferramentas do navegador.
 */

function encounter(overrides: Partial<Encounter> = {}): Encounter {
  return {
    id: '9019956f-bdd8-4d61-868d-09b02332dad0',
    patientId: '11111111-1111-4111-8111-111111111111',
    patientName: 'Marina Costa',
    professionalId: '22222222-2222-4222-8222-222222222222',
    professionalName: 'Dra. Helena',
    appointmentId: null,
    status: 'open',
    chiefComplaint: 'Dor torácica há 2 dias',
    startedAt: new Date('2026-08-10T13:00:00.000Z'),
    endedAt: null,
    ...overrides,
  }
}

describe('quem vê a queixa', () => {
  it('com `record.read`, a queixa atravessa', () => {
    const dto = toEncounterDto(encounter(), true)

    expect(dto.chiefComplaint).toBe('Dor torácica há 2 dias')
  })

  it('sem `record.read`, a chave NÃO existe no DTO', () => {
    /*
     * Ausente, e não `null`: `null` significaria "ninguém registrou", e a tela
     * ofereceria um campo que o servidor recusaria. A distinção é o que faz o
     * componente aparecer só para quem pode usá-lo.
     */
    const dto = toEncounterDto(encounter(), false)

    expect('chiefComplaint' in dto).toBe(false)
  })

  it('o texto não sobra em lugar nenhum do DTO', () => {
    // O teste que pega o erro real: um campo novo que copiasse a queixa por
    // engano passaria pelos dois casos acima e vazaria aqui.
    const dto = toEncounterDto(encounter(), false)

    expect(JSON.stringify(dto)).not.toContain('torácica')
  })

  it('sem queixa registrada, quem pode ler recebe null', () => {
    const dto = toEncounterDto(encounter({ chiefComplaint: null }), true)

    expect(dto.chiefComplaint).toBeNull()
    expect('chiefComplaint' in dto).toBe(true)
  })

  it('o resto do atendimento atravessa para os dois papéis', () => {
    // A recepção precisa saber quem está com quem, e desde quando.
    const restrito = toEncounterDto(encounter(), false)

    expect(restrito.patientName).toBe('Marina Costa')
    expect(restrito.professionalName).toBe('Dra. Helena')
    expect(restrito.status).toBe('open')
  })
})

/**
 * Depois de encerrado, o que ficou registrado é o que a clínica afirmou sobre
 * aquela consulta.
 */
describe('quando a queixa pode ser registrada', () => {
  it('atendimento aberto aceita', () => {
    expect(canRecordChiefComplaint('open')).toBe(true)
  })

  it.each(['closed', 'canceled'] as const)('%s não aceita', (status) => {
    // Reescrever a queixa de um atendimento fechado mudaria a justificativa de
    // uma conduta já tomada.
    expect(canRecordChiefComplaint(status)).toBe(false)
  })
})
