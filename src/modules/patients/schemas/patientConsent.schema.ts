import { z } from 'zod'

import {
  PATIENT_CONSENT_PURPOSES,
  type PatientConsentPurpose,
} from '../domain/PatientConsentRepository'

/**
 * Contrato das acoes de consentimento (P-03).
 *
 * A regra que organiza este arquivo inteiro: **o navegador escolhe a finalidade e
 * o paciente; nada mais.**
 *
 *  - `clinicId` nao existe como campo. Sai do `ActionContext` — P3 de
 *    docs/01-arquitetura.md.
 *  - `documentVersion` nao existe como campo. Sai de
 *    `application/consentDocumentVersions.ts`, no servidor. Se viesse do
 *    formulario, o registro diria "aceitou a v9" porque o cliente digitou v9, e um
 *    registro de consentimento que aceita a propria versao por parametro nao prova
 *    nada.
 *  - `grantedAt` / `revokedAt` nao existem como campos. Sao o relogio do servidor.
 *  - `purpose` e um enum fechado, derivado do enum `consent_purpose` do banco.
 */

export const patientConsentMessages = {
  invalidPurpose: 'Selecione uma finalidade válida.',
  invalidPatient: 'Este paciente não está mais disponível nesta clínica.',
  invalidFields: 'Não foi possível registrar esta escolha. Recarregue a página.',
  forbidden: 'Você não tem permissão para alterar consentimentos.',
  notFound: 'Este paciente não está mais disponível nesta clínica.',
  alreadyGranted:
    'Já existe um consentimento vigente para esta finalidade. Recarregue a página.',
  nothingToRevoke:
    'Não há consentimento vigente para revogar nesta finalidade. Recarregue a página.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpectedGrant:
    'Não foi possível registrar o consentimento agora. Tente novamente.',
  unexpectedRevoke:
    'Não foi possível revogar o consentimento agora. Tente novamente.',
} as const

/**
 * Rotulo e explicacao de cada finalidade, em pt-BR.
 *
 * `Record<PatientConsentPurpose, ...>` de proposito: finalidade nova no enum do
 * banco quebra a compilacao aqui ate alguem escrever o texto que o paciente vai
 * ler. Registro de consentimento sem texto legivel nao e registro de consentimento.
 *
 * A explicacao descreve **o tratamento de dado**, nao a norma. Este painel e um
 * registro tecnico de escolha — quem redige a politica e quem responde por ela e a
 * clinica, e o texto da tela diz isso em voz alta.
 */
export const consentPurposeMeta: Record<
  PatientConsentPurpose,
  { label: string; description: string }
> = {
  terms_of_service: {
    label: 'Termos de uso',
    description:
      'Aceite dos termos de uso da clínica para atendimento e uso do sistema.',
  },
  privacy_policy: {
    label: 'Política de privacidade',
    description:
      'Ciência de como os dados pessoais são tratados, armazenados e por quanto tempo.',
  },
  health_data_processing: {
    label: 'Tratamento de dados de saúde',
    description:
      'Uso dos dados de saúde para o cuidado: prontuário, prescrição e histórico clínico.',
  },
  marketing_communication: {
    label: 'Comunicação e marketing',
    description:
      'Envio de lembretes promocionais, campanhas e novidades por WhatsApp, e-mail ou SMS.',
  },
  ai_assisted_processing: {
    label: 'Apoio de inteligência artificial',
    description:
      'Uso de recursos de IA para apoiar a equipe. A decisão clínica continua sendo humana.',
  },
}

/** Aviso fixo do painel — a tela nunca se apresenta como aconselhamento jurídico. */
export const consentPanelDisclaimer =
  'Este painel é o registro técnico da escolha do paciente, com data e versão do documento. Não substitui a política de privacidade da clínica nem constitui aconselhamento jurídico.'

const purposeSchema = z.enum(
  PATIENT_CONSENT_PURPOSES,
  patientConsentMessages.invalidPurpose,
)

/**
 * `patientId` **pode** vir do cliente: diz O QUE registrar, nunca ONDE. A clinica
 * continua saindo do contexto e o adapter filtra por ela, entao um id de outra
 * clinica nao acha linha e volta como 'not-found' — sem revelar que aquele id
 * existe em algum lugar. Mesmo desenho de `updatePatientSchema`.
 */
export const grantPatientConsentSchema = z.object({
  patientId: z.uuid(patientConsentMessages.invalidPatient),
  purpose: purposeSchema,
})

export type GrantPatientConsentInput = z.infer<typeof grantPatientConsentSchema>

/** Revogar tem exatamente a mesma entrada: o alvo e a finalidade. */
export const revokePatientConsentSchema = grantPatientConsentSchema

export type RevokePatientConsentInput = z.infer<
  typeof revokePatientConsentSchema
>

/** Campos que a tela sabe marcar — limita `fieldErrors` ao que existe nela. */
export type PatientConsentField = keyof GrantPatientConsentInput

/**
 * O que as actions de consentimento devolvem ao cliente.
 *
 * Seis campos, e o que ficou de fora e a parte que importa: **nao ha `clinicId`,
 * `subjectId`, `subjectType`, `ip` nem `userAgent`**. O adapter nem chega a
 * seleciona-los do banco; este tipo e a segunda barreira, no compilador.
 *
 * Somente escalares: `Date` nao atravessa a fronteira de uma Server Action
 * (docs/06-acoes-e-auditoria.md §2).
 */
export interface PatientConsentDto {
  id: string
  purpose: PatientConsentPurpose
  documentVersion: string
  /** ISO 8601 completo, em UTC. */
  grantedAt: string
  /** ISO 8601 completo em UTC, ou null enquanto vigente. */
  revokedAt: string | null
  isActive: boolean
}
