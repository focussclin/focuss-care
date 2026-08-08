import { describe, expect, it } from 'vitest'

import {
  PATIENT_CONSENT_PURPOSES,
  toPatientConsentPurpose,
} from '../domain/PatientConsentRepository'
import { currentDocumentVersion } from '../application/consentDocumentVersions'
import {
  consentPanelDisclaimer,
  consentPurposeMeta,
  grantPatientConsentSchema,
  revokePatientConsentSchema,
} from './patientConsent.schema'

/**
 * Contrato de entrada das acoes de consentimento (P-03).
 *
 * O que estes testes protegem nao e a validacao em si — e a **forma** do contrato.
 * Um campo a mais aceito aqui e um valor que o navegador passa a controlar em um
 * registro legal, e o dia em que alguem acrescentar `documentVersion` ao schema
 * "para facilitar o formulario" nada quebra sozinho. Estes testes quebram.
 */

const PATIENT = '9019956f-bdd8-4d61-868d-09b02332dad0'

describe('grantPatientConsentSchema — o que o navegador pode escolher', () => {
  it('aceita paciente e finalidade', () => {
    const parsed = grantPatientConsentSchema.safeParse({
      patientId: PATIENT,
      purpose: 'health_data_processing',
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({
      patientId: PATIENT,
      purpose: 'health_data_processing',
    })
  })

  it('descarta versao, datas e clinica mandadas pelo cliente', () => {
    // `z.object` ignora chave desconhecida: o que o cliente inventar nao chega ao
    // caso de uso. A versao vem de `consentDocumentVersions`, as datas do relogio
    // do servidor e a clinica do `ActionContext`.
    const parsed = grantPatientConsentSchema.parse({
      patientId: PATIENT,
      purpose: 'privacy_policy',
      documentVersion: '9999-99.v9',
      grantedAt: '1900-01-01T00:00:00.000Z',
      revokedAt: null,
      clinicId: '7e3b0000-0000-4000-8000-00000000b48e',
    })

    expect(Object.keys(parsed).sort()).toEqual(['patientId', 'purpose'])
    expect(JSON.stringify(parsed)).not.toContain('9999-99.v9')
    expect(JSON.stringify(parsed)).not.toContain('7e3b0000')
  })

  it('recusa finalidade fora do enum do banco', () => {
    for (const purpose of ['', 'tudo', 'health_data', 'HEALTH_DATA_PROCESSING']) {
      expect(
        grantPatientConsentSchema.safeParse({ patientId: PATIENT, purpose })
          .success,
      ).toBe(false)
    }
  })

  it('recusa paciente que nao e uuid', () => {
    for (const patientId of ['', 'nao-e-uuid', '1', '../../etc/passwd']) {
      expect(
        grantPatientConsentSchema.safeParse({
          patientId,
          purpose: 'terms_of_service',
        }).success,
      ).toBe(false)
    }
  })

  it('a mensagem de recusa nao ecoa o valor recusado', () => {
    const parsed = grantPatientConsentSchema.safeParse({
      patientId: 'maria.silva@example.com',
      purpose: 'terms_of_service',
    })

    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed.error?.issues.map((issue) => issue.message)))
      .not.toContain('maria.silva')
  })

  it('revogar tem exatamente o mesmo contrato de conceder', () => {
    const input = { patientId: PATIENT, purpose: 'marketing_communication' }

    expect(revokePatientConsentSchema.parse(input)).toEqual(
      grantPatientConsentSchema.parse(input),
    )
  })
})

describe('finalidades — vocabulario fechado, derivado do banco', () => {
  it('sao as cinco do enum consent_purpose', () => {
    expect([...PATIENT_CONSENT_PURPOSES]).toEqual([
      'terms_of_service',
      'privacy_policy',
      'health_data_processing',
      'marketing_communication',
      'ai_assisted_processing',
    ])
  })

  it('nenhuma finalidade fica sem rotulo e explicacao em pt-BR', () => {
    for (const purpose of PATIENT_CONSENT_PURPOSES) {
      const meta = consentPurposeMeta[purpose]

      expect(meta.label.trim().length).toBeGreaterThan(0)
      expect(meta.description.trim().length).toBeGreaterThan(0)
      // Rotulo e o que o paciente le: o enum cru nunca pode vazar para a tela.
      expect(meta.label).not.toContain('_')
    }
  })

  it('o painel se declara registro tecnico, nao aconselhamento juridico', () => {
    expect(consentPanelDisclaimer).toContain('registro técnico')
    expect(consentPanelDisclaimer).toContain('constitui aconselhamento jurídico')
    expect(consentPanelDisclaimer).toContain('Não substitui a política de privacidade')
  })

  it('o estreitamento aceita todo valor do enum do banco', () => {
    // A prova real e de compilacao (ver o JSDoc de `toPatientConsentPurpose`);
    // aqui so se confirma que a funcao nao transforma nada em runtime.
    for (const purpose of PATIENT_CONSENT_PURPOSES) {
      expect(toPatientConsentPurpose(purpose)).toBe(purpose)
    }
  })
})

describe('versao do documento — server-side', () => {
  it('toda finalidade tem uma versao vigente', () => {
    for (const purpose of PATIENT_CONSENT_PURPOSES) {
      expect(currentDocumentVersion(purpose)).toMatch(/^\d{4}-\d{2}\.v\d+$/)
    }
  })

  it('a versao nao depende de nada que o cliente mande', () => {
    // Chamar duas vezes com a mesma finalidade devolve o mesmo valor, e nao ha
    // segundo parametro por onde influencia-lo.
    expect(currentDocumentVersion('privacy_policy')).toBe(
      currentDocumentVersion('privacy_policy'),
    )
    expect(currentDocumentVersion.length).toBe(1)
  })
})
