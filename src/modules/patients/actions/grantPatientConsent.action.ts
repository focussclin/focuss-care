'use server'

import { cacheTags } from '@/lib/cache/tags'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { currentDocumentVersion } from '../application/consentDocumentVersions'
import { patientWriteRoles } from '../application/patientWriteRoles'
import { toPatientConsentDto } from '../application/toPatientConsentDto'
import { toWriteFailure } from '../application/writeFailure'
import {
  patientConsentRepositoryFor,
  patientRepositoryFor,
} from '../infrastructure/repository'
import {
  grantPatientConsentSchema,
  patientConsentMessages,
  type GrantPatientConsentInput,
  type PatientConsentDto,
  type PatientConsentField,
} from '../schemas/patientConsent.schema'

/**
 * Registrar o consentimento do paciente para uma finalidade (P-03).
 *
 * Mesmo pipeline de toda escrita do produto — autenticar -> clinica ativa ->
 * papel -> Zod -> caso de uso -> invalidar -> auditar (P5 do roadmap). O que a
 * entrada carrega e apenas **qual paciente** e **qual finalidade**:
 *
 *  - a clinica sai do `ActionContext`;
 *  - a versao do documento sai de `application/consentDocumentVersions.ts`;
 *  - `granted_at` e o relogio do servidor;
 *  - `revoked_at` nasce null.
 *
 * Nenhum desses quatro tem campo no schema, entao nao ha como o navegador
 * influenciar o que fica registrado alem da propria escolha.
 */

const failureMessages = {
  conflict: patientConsentMessages.alreadyGranted,
  forbidden: patientConsentMessages.forbidden,
  notFound: patientConsentMessages.notFound,
  unavailable: patientConsentMessages.unavailable,
  unexpected: patientConsentMessages.unexpectedGrant,
}

/**
 * Paciente confirmado pelo banco, entregue ao callback de cache.
 *
 * O callback de `cacheTags` nao recebe a entrada de proposito (ver o JSDoc em
 * `createAction`), e a tag do perfil precisa do id do paciente. A ponte e o
 * proprio objeto de saida, como em `updatePatient.action.ts`: `WeakMap` por
 * objeto e unica por chamada — duas recepcionistas registrando consentimentos ao
 * mesmo tempo nao se sobrescrevem — e a entrada some com a coleta de lixo quando
 * o callback nao chega a rodar.
 *
 * O valor guardado e `patient.id`, a linha que o repositorio devolveu DEPOIS da
 * RLS, nunca o `patientId` cru da entrada.
 */
const patientByOutput = new WeakMap<PatientConsentDto, string>()

const runGrantConsent = createAction<
  GrantPatientConsentInput,
  PatientConsentDto,
  PatientConsentField
>({
  name: 'patient.consent.grant',
  schema: grantPatientConsentSchema,
  roles: patientWriteRoles,
  messages: {
    forbidden: patientConsentMessages.forbidden,
    validation: patientConsentMessages.invalidFields,
    unavailable: patientConsentMessages.unavailable,
    unexpected: patientConsentMessages.unexpectedGrant,
    'not-found': patientConsentMessages.notFound,
  },

  /**
   * So a tag do paciente: consentimento nao aparece na listagem, entao invalidar
   * `patients` seria derrubar cache de quem nao mudou.
   *
   * **Sem `revalidatePaths`.** O perfil e `/pacientes/[patientId]`, e
   * `revalidatePath` exige o parametro `type` para caminho com segmento dinamico
   * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md)
   * — parametro que a assinatura de `revalidatePaths` nao oferece, e mudar o
   * `createAction` por causa desta fatia seria mexer em area compartilhada (§6 do
   * roadmap). Quem acabou de clicar ve o resultado pelo `router.refresh()` do
   * container, que e o mesmo caminho ja usado por editar e arquivar.
   */
  cacheTags: ({ clinicId }, output) => {
    const patientId = patientByOutput.get(output)
    return patientId ? [cacheTags.patient(clinicId, patientId)] : []
  },

  handler: async (input, context) => {
    const patients = patientRepositoryFor(context.supabase)
    const consents = patientConsentRepositoryFor(context.supabase)

    try {
      // Paciente de outra clinica e paciente inexistente dao no mesmo: o
      // repositorio filtra por `clinic_id` e a resposta e a mesma nos dois casos,
      // sem revelar que o id existe em algum tenant.
      const patient = await patients.findById(context.clinicId, input.patientId)
      if (!patient) {
        return err<PatientConsentField>(
          'not-found',
          patientConsentMessages.notFound,
        )
      }

      // Ha consentimento vigente? Entao o clique veio de uma tela desatualizada.
      // A checagem e leitura-antes-de-escrita e NAO e atomica: o schema remoto nao
      // tem indice unico parcial que a garanta (ver §9.5 de
      // docs/07-cadastro-de-pacientes.md). Duas concessoes simultaneas podem
      // deixar duas linhas vigentes — o painel mostra a mais recente e a revogacao
      // fecha todas, entao a corrida degrada em linha duplicada no historico, nao
      // em consentimento fantasma.
      const history = await consents.listByPatient(context.clinicId, patient.id)
      if (history.some((consent) => consent.purpose === input.purpose && consent.revokedAt === null)) {
        return err<PatientConsentField>(
          'conflict',
          patientConsentMessages.alreadyGranted,
        )
      }

      const consent = await consents.grant(context.clinicId, patient.id, {
        purpose: input.purpose,
        documentVersion: currentDocumentVersion(input.purpose),
        grantedAt: new Date(),
      })

      const dto = toPatientConsentDto(consent)
      patientByOutput.set(dto, patient.id)

      return ok<PatientConsentDto>(dto)
    } catch (cause) {
      return toWriteFailure<PatientConsentField>(
        'patient.consent.grant',
        cause,
        failureMessages,
      )
    }
  },

  /**
   * `patient.consent.granted` — finalidade e versao, nunca quem e o paciente.
   *
   * `entityId` e o id do CONSENTIMENTO. O vinculo com o paciente vive em
   * `consents.subject_id`, alcancavel a partir dele — e por isso nao precisa ser
   * repetido aqui. Nao e detalhe de estilo: `sanitizeMetadata` descarta qualquer
   * chave que case com `/paciente|patient/`, entao um `patient_id` no `after`
   * viraria um campo silenciosamente perdido, e o log pareceria completo sem estar.
   *
   * Best-effort como todo o resto: a policy de INSERT de `audit_log` ainda nao foi
   * verificada no projeto remoto (P-A1). O consentimento e gravado de qualquer
   * forma; o evento que falha vira log de servidor.
   */
  audit: (output) => ({
    action: 'patient.consent.granted',
    entityType: 'consent',
    entityId: output.id,
    after: {
      purpose: output.purpose,
      document_version: output.documentVersion,
      subject_type: 'patient',
      source: 'patient-profile',
    },
  }),
})

export async function grantPatientConsentAction(
  rawInput: unknown,
): Promise<ActionResult<PatientConsentDto, PatientConsentField>> {
  return runGrantConsent(rawInput)
}
