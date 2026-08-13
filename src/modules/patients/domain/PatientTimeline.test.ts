import { describe, expect, it } from 'vitest'

import {
  eventKindsFor,
  orderPatientEvents,
  type PatientEvent,
  type PatientEventKind,
} from './PatientTimeline'

/**
 * A linha do tempo do paciente — ordem e permissão.
 *
 * As duas regras cobertas aqui têm consequência clínica direta: uma lista que se
 * reordena a cada carregamento faz quem lê duvidar do que viu, e uma que mostra
 * evolução para quem não pode lê-la é a porta lateral do prontuário.
 */

function evento(
  id: string,
  kind: PatientEventKind,
  occurredAt: string,
): PatientEvent {
  return {
    id,
    kind,
    occurredAt: new Date(occurredAt),
    title: kind,
    detail: null,
    actor: null,
  }
}

describe('ordem', () => {
  it('do mais recente para o mais antigo', () => {
    const eventos = orderPatientEvents([
      evento('a', 'record', '2026-08-01T10:00:00Z'),
      evento('b', 'record', '2026-08-12T10:00:00Z'),
      evento('c', 'record', '2026-08-05T10:00:00Z'),
    ])

    expect(eventos.map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('empate no mesmo instante segue a ordem da consulta', () => {
    /*
     * Acontece de verdade: o atendimento é encerrado e a evolução assinada no
     * mesmo segundo. A ordem entre eles precisa ser a do que aconteceu antes —
     * e, acima de tudo, precisa ser sempre a mesma.
     */
    const instante = '2026-08-12T14:00:00Z'
    const eventos = orderPatientEvents([
      evento('receita', 'prescription', instante),
      evento('consulta', 'appointment', instante),
      evento('evolucao', 'record', instante),
      evento('atendimento', 'encounter', instante),
    ])

    expect(eventos.map((e) => e.id)).toEqual([
      'receita',
      'evolucao',
      'atendimento',
      'consulta',
    ])
  })

  it('a ordem é estável entre carregamentos', () => {
    // Mesmo instante e mesmo tipo: sem o desempate por id, a ordem dependeria
    // de como o banco devolveu as linhas naquela vez.
    const instante = '2026-08-12T14:00:00Z'
    const entrada = [
      evento('r1', 'record', instante),
      evento('r2', 'record', instante),
      evento('r3', 'record', instante),
    ]

    const primeira = orderPatientEvents(entrada).map((e) => e.id)
    const segunda = orderPatientEvents([...entrada].reverse()).map((e) => e.id)

    expect(primeira).toEqual(segunda)
  })

  it('não altera o array recebido', () => {
    const entrada = [
      evento('a', 'record', '2026-08-01T10:00:00Z'),
      evento('b', 'record', '2026-08-12T10:00:00Z'),
    ]

    orderPatientEvents(entrada)

    expect(entrada.map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('o que cada papel enxerga', () => {
  it('sem acesso clínico, nada de evolução, receita ou sinais vitais', () => {
    /*
     * `admin` e `finance` alcançam a ficha por `patient.read`. A matriz de I-05
     * diz, com todas as letras, que o que eles não alcançam é "agenda,
     * atendimento e prontuário".
     */
    const kinds = eventKindsFor({
      canReadRecords: false,
      canReadAppointments: false,
      canReadPatients: true,
    })

    expect(kinds).not.toContain('record')
    expect(kinds).not.toContain('prescription')
    expect(kinds).not.toContain('vitals')
    expect(kinds).not.toContain('encounter')
    // Documento é administrativo: a recepção precisa dele para trabalhar.
    expect(kinds).toContain('document')
  })

  it('recepção vê agenda e atendimento, não o registro clínico', () => {
    const kinds = eventKindsFor({
      canReadRecords: false,
      canReadAppointments: true,
      canReadPatients: true,
    })

    expect(kinds).toContain('appointment')
    expect(kinds).toContain('encounter')
    expect(kinds).not.toContain('record')
  })

  it('profissional vê tudo', () => {
    const kinds = eventKindsFor({
      canReadRecords: true,
      canReadAppointments: true,
      canReadPatients: true,
    })

    expect(kinds).toHaveLength(6)
  })

  it('sem permissão nenhuma, lista vazia — e a rota nem consulta', () => {
    const kinds = eventKindsFor({
      canReadRecords: false,
      canReadAppointments: false,
      canReadPatients: false,
    })

    expect(kinds).toEqual([])
  })
})
