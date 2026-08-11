import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  describeClinicalScopes,
  normalizeClinicalScopes,
  recordClinicalAccess,
} from './clinical-access'

/**
 * A camada que registra leitura de dado clínico.
 *
 * O que se prova aqui é o limite dela: um evento por ato, só com o que foi
 * entregue, e **nada** quando não houve acesso clínico nenhum.
 */

const PATIENT = '22222222-2222-4222-8222-222222222222'

const recordAuditEvent = vi.fn(async (event: unknown) => {
  void event
  return { recorded: false as const, reason: 'test' }
})
vi.mock('./audit-log', () => ({
  recordAuditEvent: (event: unknown) => recordAuditEvent(event),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a ordem dos escopos é canônica', () => {
  it('não depende da ordem em que a rota os coletou', () => {
    /*
     * Sem isto, `vitals,allergies` e `allergies,vitals` seriam duas strings
     * diferentes para o mesmo acesso, e agrupar a trilha por escopo contaria os
     * dois separados.
     */
    expect(normalizeClinicalScopes(['allergies', 'vitals'])).toEqual([
      'vitals',
      'allergies',
    ])
    expect(normalizeClinicalScopes(['vitals', 'allergies'])).toEqual([
      'vitals',
      'allergies',
    ])
  })

  it('escopo repetido entra uma vez só', () => {
    expect(normalizeClinicalScopes(['vitals', 'vitals'])).toEqual(['vitals'])
  })
})

describe('o texto que a tela mostra', () => {
  it('nomeia o que aquele leitor recebeu, e não os quatro recortes', () => {
    // A recepção recebe sinais vitais e não recebe prontuário: um aviso genérico
    // faria a mesma frase valer para acessos diferentes.
    expect(describeClinicalScopes(['vitals'])).toBe('sinais vitais')
  })

  it('junta com "e", sem vírgula antes', () => {
    expect(
      describeClinicalScopes([
        'medical_records',
        'prescriptions',
        'vitals',
        'allergies',
      ]),
    ).toBe('prontuário, prescrições, sinais vitais e alergias')
  })

  it('sem escopo, não há frase', () => {
    expect(describeClinicalScopes([])).toBe('')
  })
})

describe('o que vira evento', () => {
  it('um ato, um evento, com os escopos entregues', async () => {
    await recordClinicalAccess({
      patientId: PATIENT,
      scopes: ['allergies', 'medical_records'],
    })

    expect(recordAuditEvent).toHaveBeenCalledTimes(1)
    expect(recordAuditEvent).toHaveBeenCalledWith({
      action: 'record.read',
      entityType: 'patient',
      entityId: PATIENT,
      after: {
        scope: 'patient_chart',
        target: 'patient',
        clinical_scopes: 'medical_records,allergies',
      },
    })
  })

  it('sem recorte clínico entregue, NÃO grava nada', async () => {
    /*
     * `finance` abre a ficha por `patient.read` e recebe nome, telefone e
     * documento — cadastro, não saúde. Um `record.read` para ele seria acusação
     * falsa, e uma trilha com acusação falsa deixa de responder qualquer coisa.
     */
    await recordClinicalAccess({ patientId: PATIENT, scopes: [] })

    expect(recordAuditEvent).not.toHaveBeenCalled()
  })

  it('sem paciente, não grava', async () => {
    await recordClinicalAccess({ patientId: '  ', scopes: ['vitals'] })

    expect(recordAuditEvent).not.toHaveBeenCalled()
  })

  it('nenhum conteúdo clínico atravessa — só os nomes dos recortes', async () => {
    await recordClinicalAccess({ patientId: PATIENT, scopes: ['vitals'] })

    const event = recordAuditEvent.mock.calls[0][0]

    // `audit_log` é legível por `audit.read`, que `admin` tem e `record.read`
    // não: o que estiver aqui contorna a trava do prontuário.
    expect(JSON.stringify(event)).not.toContain('content')
    expect(JSON.stringify(event)).toContain('vitals')
  })
})
