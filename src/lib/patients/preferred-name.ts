/**
 * Como o paciente deve ser chamado — a regra, em um lugar só.
 *
 * # Por que em `lib/`, e não no módulo de pacientes
 *
 * `patients ( full_name )` aparece em **nove módulos**: agenda, atendimento,
 * financeiro, convênios, inbox, tarefas, CRM, conciliação e documentos. A regra
 * do nome social precisa valer nos nove, e nenhum módulo importa o interior de
 * outro — regra verificada por `publicApi.test.ts`. É a mesma posição de
 * `lib/utils/phone` e `lib/auth/permissions`, e pelo mesmo motivo.
 *
 * Enquanto isto morou em `modules/patients/domain`, o nome social só aparecia na
 * ficha e na listagem de pacientes. O efeito prático: a pessoa era chamada pelo
 * nome social na tela de cadastro e pelo nome de registro na sala de espera —
 * que é exatamente o dano que a coluna existe para evitar.
 */

/** O recorte mínimo para decidir. Qualquer linha com os dois campos serve. */
export interface NameablePatient {
  /** `patients.full_name` — o nome de registro, o do documento. */
  fullName: string
  /** `patients.social_name` — como a pessoa é chamada. */
  socialName?: string | null
}

/**
 * Nome social vence sempre que existir.
 *
 * Espaço em branco não conta: `'   '` passaria por um `??` ingênuo e o paciente
 * ficaria SEM nome na tela.
 */
export function preferredPatientName(patient: NameablePatient): string {
  const social = patient.socialName?.trim()
  return social ? social : patient.fullName
}

/**
 * Atalho para o formato cru do banco, que é como os nove adapters o recebem.
 *
 * Existe para o mapeador não precisar montar um objeto intermediário só para
 * responder uma pergunta de duas linhas — e para o `?? 'Paciente'` de cada
 * adapter continuar em um lugar previsível.
 */
export function preferredNameOfRow(
  row: { full_name: string; social_name?: string | null } | null | undefined,
  fallback = 'Paciente',
): string {
  if (!row) return fallback

  return preferredPatientName({
    fullName: row.full_name,
    socialName: row.social_name,
  })
}
