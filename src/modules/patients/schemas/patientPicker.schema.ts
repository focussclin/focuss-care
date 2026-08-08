import { z } from 'zod'

import {
  PATIENT_SEARCH_MAX_LENGTH,
  sanitizePatientSearch,
} from './patientQuery.schema'

/**
 * O contrato do seletor de paciente — usado pelo Novo Agendamento (A-01).
 *
 * # Por que existe separado de `patientListQuery`
 *
 * Aquele descreve a TELA de pacientes: filtro por status, cursor de paginação,
 * limite de até 50. Este descreve um seletor dentro de um formulário, e as
 * necessidades divergem em tudo o que importa — aqui não há paginação (quem
 * procura no seletor refina o termo, não navega páginas), o status é sempre
 * "ativo" (não se marca consulta para paciente arquivado) e o limite é curto de
 * propósito.
 *
 * Reaproveitar o outro schema traria três campos que o seletor nunca usa, e
 * campo que atravessa a fronteira sem ser usado é superfície de graça.
 */

export const PICKER_RESULT_LIMIT = 8

export const PICKER_MIN_QUERY_LENGTH = 2

export const patientPickerMessages = {
  queryTooShort: 'Digite pelo menos dois caracteres para buscar.',
  forbidden: 'Você não tem permissão para consultar pacientes.',
  unavailable: 'Não foi possível buscar agora. Tente novamente.',
  unexpected: 'Não foi possível buscar agora. Tente novamente.',
} as const

export const searchPatientsSchema = z.object({
  /**
   * O termo, higienizado pelo MESMO sanitizador da listagem.
   *
   * `sanitizePatientSearch` tira curinga de `LIKE`, gramática do PostgREST e
   * caractere invisível. Ter duas limpezas para a mesma coluna faria a busca do
   * seletor e a da tela discordarem sobre o que é um termo válido — e a que
   * fosse mais permissiva viraria o caminho para injetar padrão na consulta.
   */
  query: z
    .string()
    .max(PATIENT_SEARCH_MAX_LENGTH * 2, patientPickerMessages.unexpected)
    .transform((value, ctx) => {
      const clean = sanitizePatientSearch(value)

      if (!clean || clean.length < PICKER_MIN_QUERY_LENGTH) {
        ctx.addIssue({
          code: 'custom',
          message: patientPickerMessages.queryTooShort,
        })
        return z.NEVER
      }

      return clean
    }),
})

export type SearchPatientsInput = z.infer<typeof searchPatientsSchema>

/**
 * O que o seletor recebe de volta.
 *
 * **Nome e id, e nada mais.** A tela de agendamento precisa exibir e identificar;
 * telefone, e-mail, documento e data de nascimento não têm papel nenhum ali, e
 * cada um deles atravessando a fronteira é dado pessoal circulando sem uso.
 */
export interface PatientOptionDto {
  id: string
  name: string
}
