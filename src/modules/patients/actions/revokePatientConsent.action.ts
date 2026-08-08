'use server'

import { cacheTags } from '@/lib/cache/tags'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { patientWriteRoles } from '../application/patientWriteRoles'
import { toPatientConsentDto } from '../application/toPatientConsentDto'
import { toWriteFailure } from '../application/writeFailure'
import {
  patientConsentRepositoryFor,
  patientRepositoryFor,
} from '../infrastructure/repository'
import {
  patientConsentMessages,
  revokePatientConsentSchema,
  type PatientConsentDto,
  type PatientConsentField,
  type RevokePatientConsentInput,
} from '../schemas/patientConsent.schema'

/**
 * Revogar o consentimento vigente de uma finalidade (P-03).
 *
 * **Revogar nao apaga nada.** Carimba `revoked_at` na linha e deixa o historico de
 * pe — a linha e a prova de que houve consentimento entre duas datas, e destrui-la
 * destruiria exatamente o registro que a LGPD exige (§8 do roadmap: exclusao e
 * logica, nunca `DELETE`).
 *
 * Revoga **todos** os registros vigentes daquela finalidade, nao um. Sem indice
 * unico no banco, pode haver mais de um; fechar so o mais recente deixaria o
 * paciente com consentimento ativo enquanto a tela diz "revogado".
 */

const failureMessages = {
  conflict: patientConsentMessages.nothingToRevoke,
  forbidden: patientConsentMessages.forbidden,
  notFound: patientConsentMessages.notFound,
  unavailable: patientConsentMessages.unavailable,
  unexpected: patientConsentMessages.unexpectedRevoke,
}

/** Mesma ponte de `grantPatientConsent.action.ts` — ver o JSDoc de la. */
const patientByOutput = new WeakMap<PatientConsentDto, string>()

/** Quantas linhas vigentes foram fechadas — ver o JSDoc de `audit`, abaixo. */
const revokedCountByOutput = new WeakMap<PatientConsentDto, number>()

const runRevokeConsent = createAction<
  RevokePatientConsentInput,
  PatientConsentDto,
  PatientConsentField
>({
  name: 'patient.consent.revoke',
  schema: revokePatientConsentSchema,
  roles: patientWriteRoles,
  messages: {
    forbidden: patientConsentMessages.forbidden,
    validation: patientConsentMessages.invalidFields,
    unavailable: patientConsentMessages.unavailable,
    unexpected: patientConsentMessages.unexpectedRevoke,
    'not-found': patientConsentMessages.notFound,
  },

  cacheTags: ({ clinicId }, output) => {
    const patientId = patientByOutput.get(output)
    return patientId ? [cacheTags.patient(clinicId, patientId)] : []
  },

  handler: async (input, context) => {
    const patients = patientRepositoryFor(context.supabase)
    const consents = patientConsentRepositoryFor(context.supabase)

    try {
      const patient = await patients.findById(context.clinicId, input.patientId)
      if (!patient) {
        return err<PatientConsentField>(
          'not-found',
          patientConsentMessages.notFound,
        )
      }

      const revoked = await consents.revokeActive(
        context.clinicId,
        patient.id,
        input.purpose,
        new Date(),
      )

      // Nada vigente: ou ja estava revogado, ou nunca houve registro. Nos dois
      // casos a tela que originou o clique esta desatualizada — e dizer isso e
      // melhor que responder "revogado" sobre uma linha que nao existe.
      if (revoked.length === 0) {
        return err<PatientConsentField>(
          'conflict',
          patientConsentMessages.nothingToRevoke,
        )
      }

      const dto = toPatientConsentDto(revoked[0])
      patientByOutput.set(dto, patient.id)
      revokedCountByOutput.set(dto, revoked.length)

      return ok<PatientConsentDto>(dto)
    } catch (cause) {
      return toWriteFailure<PatientConsentField>(
        'patient.consent.revoke',
        cause,
        failureMessages,
      )
    }
  },

  /**
   * `patient.consent.revoked`.
   *
   * `revoked_count` existe para tornar visivel a corrida descrita em §9.5 de
   * docs/07-cadastro-de-pacientes.md: em operacao normal e sempre 1, e um valor
   * maior no log e a evidencia de que duas concessoes simultaneas passaram — que e
   * exatamente o sinal que justificaria criar o indice unico parcial no banco.
   */
  audit: (output) => ({
    action: 'patient.consent.revoked',
    entityType: 'consent',
    entityId: output.id,
    after: {
      purpose: output.purpose,
      document_version: output.documentVersion,
      subject_type: 'patient',
      source: 'patient-profile',
      revoked_count: revokedCountByOutput.get(output) ?? 1,
    },
  }),
})

export async function revokePatientConsentAction(
  rawInput: unknown,
): Promise<ActionResult<PatientConsentDto, PatientConsentField>> {
  return runRevokeConsent(rawInput)
}
