import { describe, expect, it } from 'vitest'

import type { PatientConsent } from '../domain/PatientConsentRepository'
import type { PatientConsentDto } from '../schemas/patientConsent.schema'
import { currentDocumentVersion } from './consentDocumentVersions'
import { buildPatientConsentRows } from './patientConsentRows'
import { toPatientConsentDto } from './toPatientConsentDto'

/**
 * DTO e montagem do painel (P-03).
 *
 * O teste do DTO nao verifica so o mapeamento: verifica a **ausencia**. Este e o
 * ultimo ponto antes de o dado virar props de Client Component, e o que nao pode
 * atravessar aqui e `clinic_id`, `subject_id`, `ip` e `user_agent`.
 */

const CONSENT_ID = '11111111-1111-4111-8111-111111111111'
const VERSION = '2026-08.v1'
const MOMENT = /^\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/

function consent(overrides: Partial<PatientConsent> = {}): PatientConsent {
  return {
    id: CONSENT_ID,
    purpose: 'health_data_processing',
    documentVersion: VERSION,
    grantedAt: new Date('2026-08-07T12:00:00.000Z'),
    revokedAt: null,
    ...overrides,
  }
}

function dto(overrides: Partial<PatientConsentDto> = {}): PatientConsentDto {
  return { ...toPatientConsentDto(consent()), ...overrides }
}

// ---------------------------------------------------------------------------

describe('toPatientConsentDto', () => {
  it('serializa datas e deriva o estado vigente', () => {
    expect(toPatientConsentDto(consent())).toEqual({
      id: CONSENT_ID,
      purpose: 'health_data_processing',
      documentVersion: VERSION,
      grantedAt: '2026-08-07T12:00:00.000Z',
      revokedAt: null,
      isActive: true,
    })
  })

  it('consentimento revogado deixa de ser ativo e mantem as duas datas', () => {
    const result = toPatientConsentDto(
      consent({ revokedAt: new Date('2026-08-09T10:00:00.000Z') }),
    )

    expect(result.isActive).toBe(false)
    expect(result.revokedAt).toBe('2026-08-09T10:00:00.000Z')
    expect(result.grantedAt).toBe('2026-08-07T12:00:00.000Z')
  })

  it('nao carrega clinica, sujeito, ip nem user agent', () => {
    // A entidade tambem nao os tem (o adapter nao os seleciona). O teste fixa a
    // forma para que acrescentar um campo sensivel ao DTO quebre aqui, e nao em
    // producao, dentro de uma prop de Client Component.
    const result = toPatientConsentDto(consent())

    expect(Object.keys(result).sort()).toEqual([
      'documentVersion',
      'grantedAt',
      'id',
      'isActive',
      'purpose',
      'revokedAt',
    ])

    const serialized = JSON.stringify(result)
    for (const forbidden of [
      'clinic',
      'subject',
      'user_agent',
      'userAgent',
      '"ip"',
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })

  it('so devolve escalares — nada de Date atravessa a fronteira', () => {
    for (const value of Object.values(toPatientConsentDto(consent()))) {
      expect(['string', 'boolean', 'object']).toContain(typeof value)
      expect(value).not.toBeInstanceOf(Date)
    }
  })
})

describe('buildPatientConsentRows', () => {
  it('mostra as cinco finalidades mesmo sem nenhum registro', () => {
    const rows = buildPatientConsentRows([])

    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.state)).toEqual([
      'none',
      'none',
      'none',
      'none',
      'none',
    ])
    for (const row of rows) {
      expect(row.statusLabel).toBe('Não registrado')
      expect(row.documentVersion).toBeNull()
      expect(row.grantedAtLabel).toBeNull()
      // Sem registro, a tela mostra qual versao seria gravada agora.
      expect(row.currentDocumentVersion).toBe(currentDocumentVersion(row.purpose))
    }
  })

  it('formata data e hora no servidor', () => {
    const rows = buildPatientConsentRows([dto()])
    const row = rows.find((item) => item.purpose === 'health_data_processing')

    expect(row?.state).toBe('active')
    expect(row?.grantedAtLabel).toMatch(MOMENT)
    expect(row?.grantedAtLabel).not.toContain('Invalid')
  })

  it('distingue revogado de nunca registrado', () => {
    const rows = buildPatientConsentRows([
      dto({ revokedAt: '2026-08-09T10:00:00.000Z', isActive: false }),
    ])

    const revoked = rows.find((row) => row.purpose === 'health_data_processing')
    const never = rows.find((row) => row.purpose === 'marketing_communication')

    expect(revoked?.state).toBe('revoked')
    expect(revoked?.statusTone).toBe('negative')
    expect(revoked?.revokedAtLabel).toMatch(MOMENT)

    expect(never?.state).toBe('none')
    expect(never?.statusTone).toBe('neutral')
    expect(never?.revokedAtLabel).toBeNull()
  })

  it('um consentimento vigente vence um registro antigo revogado', () => {
    // Historico real: consentiu, revogou, consentiu de novo. O estado e "ativo",
    // e a data mostrada e a do consentimento que esta de pe.
    const rows = buildPatientConsentRows([
      dto({
        id: 'antigo',
        grantedAt: '2026-01-01T09:00:00.000Z',
        revokedAt: '2026-02-01T09:00:00.000Z',
        isActive: false,
      }),
      dto({ id: 'novo', grantedAt: '2026-08-07T12:00:00.000Z', isActive: true }),
    ])

    const row = rows.find((item) => item.purpose === 'health_data_processing')

    expect(row?.state).toBe('active')
    expect(row?.revokedAtLabel).toBeNull()
  })

  it('entre duas linhas vigentes, mostra a mais recente', () => {
    // Sem indice unico no banco, duas concessoes simultaneas deixam duas linhas
    // vigentes. A tela nao pode escolher a antiga.
    const rows = buildPatientConsentRows([
      dto({ id: 'a', grantedAt: '2026-08-01T12:00:00.000Z', documentVersion: 'antiga' }),
      dto({ id: 'b', grantedAt: '2026-08-07T12:00:00.000Z', documentVersion: VERSION }),
    ])

    const row = rows.find((item) => item.purpose === 'health_data_processing')

    expect(row?.documentVersion).toBe(VERSION)
  })

  it('sinaliza consentimento vigente numa versao anterior a vigente', () => {
    const rows = buildPatientConsentRows([dto({ documentVersion: '2020-01.v1' })])
    const row = rows.find((item) => item.purpose === 'health_data_processing')

    expect(row?.isOutdated).toBe(true)
    expect(row?.state).toBe('active')
    // Informar nao e revogar: a tela nao derruba consentimento sozinha.
    expect(row?.statusLabel).toBe('Consentimento ativo')
  })

  it('registro revogado numa versao antiga nao e "desatualizado"', () => {
    const rows = buildPatientConsentRows([
      dto({
        documentVersion: '2020-01.v1',
        revokedAt: '2026-08-09T10:00:00.000Z',
        isActive: false,
      }),
    ])

    expect(
      rows.find((row) => row.purpose === 'health_data_processing')?.isOutdated,
    ).toBe(false)
  })

  it('data ilegivel nao vira "Invalid Date" na tela', () => {
    const rows = buildPatientConsentRows([dto({ grantedAt: 'nao-e-data' })])
    const row = rows.find((item) => item.purpose === 'health_data_processing')

    expect(row?.state).toBe('active')
    expect(row?.grantedAtLabel).toBeNull()
  })

  it('nao inventa finalidade que o dominio nao conhece', () => {
    const rows = buildPatientConsentRows([
      // Linha de outro `subject_type` ou de um enum futuro: se chegasse, nao pode
      // criar uma sexta linha na tela.
      { ...dto(), purpose: 'fora_do_enum' as never },
    ])

    expect(rows).toHaveLength(5)
    expect(rows.every((row) => row.state === 'none')).toBe(true)
  })
})
