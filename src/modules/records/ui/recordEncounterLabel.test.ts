import { describe, expect, it } from 'vitest'

import type { RecordEncounterDto } from '../schemas/record.schema'
import {
  describeEncounterOption,
  encounterStatusLabel,
  formatEncounterMoment,
} from './recordEncounterLabel'

/**
 * O rótulo do atendimento existe para uma escolha ser feita sem erro.
 *
 * Dois atendimentos do mesmo paciente no mesmo dia são o caso que importa: se o
 * rótulo não os distinguir, vincular a evolução ao errado é questão de sorte.
 */

function encounter(overrides: Partial<RecordEncounterDto> = {}): RecordEncounterDto {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    status: 'open',
    startedAt: '2026-08-10T17:30:00.000Z',
    endedAt: null,
    professionalName: 'Dra. Helena',
    chiefComplaint: 'Dor lombar há três dias',
    ...overrides,
  }
}

describe('status', () => {
  it('cada estado tem nome em português', () => {
    expect(encounterStatusLabel('open')).toBe('Em andamento')
    expect(encounterStatusLabel('closed')).toBe('Encerrado')
    expect(encounterStatusLabel('canceled')).toBe('Cancelado')
  })
})

describe('momento', () => {
  it('mostra data e hora do início', () => {
    // O início é o que identifica a consulta — o fim pode nem existir ainda.
    const label = formatEncounterMoment(encounter())

    expect(label).toMatch(/\d{2}\/\d{2}/)
    expect(label).toContain('às')
  })
})

describe('opção do seletor', () => {
  it('junta momento, estado, profissional e queixa', () => {
    const label = describeEncounterOption(encounter())

    expect(label).toContain('Em andamento')
    expect(label).toContain('Dra. Helena')
    expect(label).toContain('Dor lombar')
  })

  it('sem profissional, o rótulo não ganha um separador vazio', () => {
    const label = describeEncounterOption(encounter({ professionalName: null }))

    expect(label).not.toContain('·  ·')
    expect(label).toContain('Dor lombar')
  })

  it('sem queixa, o rótulo continua identificando a consulta', () => {
    const label = describeEncounterOption(encounter({ chiefComplaint: null }))

    expect(label).toContain('Em andamento')
    expect(label).toContain('Dra. Helena')
  })

  it('queixa longa é truncada — a opção é uma linha, não o registro', () => {
    const label = describeEncounterOption(
      encounter({
        chiefComplaint:
          'Dor abdominal difusa iniciada há cinco dias, com náusea e febre vespertina',
      }),
    )

    expect(label).toContain('…')
    // O texto inteiro fica no bloco abaixo do campo, que não tem esse limite.
    expect(label).not.toContain('febre vespertina')
  })
})
