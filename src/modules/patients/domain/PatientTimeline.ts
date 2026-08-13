/**
 * A linha do tempo do paciente.
 *
 * # O problema que ela resolve
 *
 * A ficha tem oito painéis — alergias, contatos, consentimentos, prescrições,
 * prontuário, sinais vitais, tags, portal. Cada um lista o próprio recorte, em
 * ordem própria. Quem atende precisa da pergunta que nenhum deles responde:
 * **o que aconteceu com esta pessoa, em ordem?**
 *
 * Hoje isso é reconstruído de cabeça, cruzando painéis. É o tipo de trabalho que
 * a máquina faz melhor — e que, feito de cabeça com pressa, deixa passar a
 * consulta de três meses atrás onde a queixa era a mesma.
 */

/** De onde o evento veio. Determina ícone, rótulo e permissão. */
export type PatientEventKind =
  | 'appointment'
  | 'encounter'
  | 'record'
  | 'prescription'
  | 'vitals'
  | 'document'

export interface PatientEvent {
  id: string
  kind: PatientEventKind
  occurredAt: Date
  /** Uma linha: 'Consulta realizada', 'Evolução clínica', 'Receita com 3 itens'. */
  title: string
  /**
   * Complemento opcional — queixa principal, tipo de documento, profissional.
   *
   * `null` quando não há, e **omitido** quando o papel não pode ver: ver
   * `visibleTo`. A distinção importa porque a tela mostra "—" para o primeiro e
   * simplesmente não mostra a linha para o segundo.
   */
  detail: string | null
  /** Quem assinou ou atendeu, quando o evento tem autor. */
  actor: string | null
}

/**
 * Que eventos este papel enxerga.
 *
 * # Por que a regra vive aqui, e não na consulta
 *
 * A ficha do paciente é aberta por recepção, financeiro e profissional — e os
 * três precisam de linhas do tempo diferentes. Se a regra ficasse na consulta,
 * cada nova fonte de evento teria de lembrar de aplicá-la, e a que esquecesse
 * vazaria conteúdo clínico para quem não pode vê-lo.
 *
 * `record.read` é a fronteira: prontuário, prescrição, sinais vitais e a queixa
 * do atendimento são registro clínico. Consulta agendada e documento
 * administrativo não são — a recepção precisa deles para trabalhar.
 */
export function eventKindsFor(options: {
  canReadRecords: boolean
  canReadAppointments: boolean
  canReadPatients: boolean
}): PatientEventKind[] {
  const kinds: PatientEventKind[] = []

  if (options.canReadAppointments) kinds.push('appointment', 'encounter')
  if (options.canReadRecords) kinds.push('record', 'prescription', 'vitals')
  if (options.canReadPatients) kinds.push('document')

  return kinds
}

/**
 * Ordena do mais recente para o mais antigo, com desempate ESTÁVEL.
 *
 * Eventos do mesmo instante acontecem de verdade: o atendimento é encerrado e a
 * evolução é assinada no mesmo segundo. Sem desempate, a ordem entre eles muda a
 * cada carregamento — e uma linha do tempo que se reordena sozinha faz quem lê
 * duvidar do que viu antes.
 *
 * O desempate é por tipo, na ordem em que as coisas acontecem numa consulta:
 * agendamento, atendimento, sinais vitais, evolução, receita, documento.
 */
const KIND_ORDER: Record<PatientEventKind, number> = {
  appointment: 0,
  encounter: 1,
  vitals: 2,
  record: 3,
  prescription: 4,
  document: 5,
}

export function orderPatientEvents(events: readonly PatientEvent[]): PatientEvent[] {
  return [...events].sort((a, b) => {
    const diff = b.occurredAt.getTime() - a.occurredAt.getTime()
    if (diff !== 0) return diff

    const byKind = KIND_ORDER[b.kind] - KIND_ORDER[a.kind]
    if (byKind !== 0) return byKind

    // Último desempate: o id. Garante ordem idêntica entre carregamentos mesmo
    // com dois eventos do mesmo tipo no mesmo instante.
    return b.id.localeCompare(a.id)
  })
}
