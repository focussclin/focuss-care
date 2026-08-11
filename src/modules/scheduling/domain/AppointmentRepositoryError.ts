/**
 * Falha de escrita da agenda, traduzida para o domínio.
 *
 * Mesmo desenho de `PatientRepositoryError`, e pelo mesmo motivo: a action
 * precisa distinguir "horário ocupado" de "recusado pela RLS" de "erro
 * inesperado" para escolher a mensagem em pt-BR — e não pode fazer isso lendo
 * `PostgrestError`, senão o formato do Supabase atravessa a porta e o adapter
 * deixa de ser trocável.
 *
 * `code` é diagnóstico opaco (o SQLSTATE, quando existe) e serve para o LOG DO
 * SERVIDOR. Nunca para a tela: mensagem de banco cita coluna e constraint.
 */

import type { AppointmentStatus } from '@/modules/_shared/domain/types'

export type AppointmentWriteFailure =
  /**
   * Já existe atendimento do mesmo profissional no intervalo.
   *
   * Desde **A-02** isto é detectado pela própria aplicação, com uma consulta de
   * sobreposição antes da escrita — não depende mais de haver constraint no
   * banco. A constraint continua sendo o que fecharia a janela de corrida, e a
   * proposta está em `supabase/migrations/`.
   */
  | 'conflict'
  /**
   * A SALA já está ocupada nesse intervalo.
   *
   * Separado de `conflict` porque a ação que resolve é outra: conflito de
   * profissional se resolve mudando o horário; conflito de sala se resolve
   * mudando a **sala**, e o horário continua bom. Colapsar os dois faria a
   * recepção remarcar a consulta inteira para um problema que um `select`
   * resolve.
   *
   * Vem exclusivamente do banco (`appointments_room_no_overlap`, SQLSTATE
   * `23P01`), e não de consulta prévia da aplicação — ao contrário de
   * `conflict`. Enquanto `20260809_rooms.sql` não for aplicada, a constraint
   * não existe e este ramo nunca ocorre.
   */
  | 'room-conflict'
  /**
   * O horário está fora do expediente que a clínica declarou.
   *
   * **Não é recusa definitiva.** Encaixe fora do horário acontece em clínica
   * pequena, e proibi-lo faria a recepção registrar hora falsa para conseguir
   * marcar — o que estraga a agenda de verdade. A action devolve
   * 'needs-confirmation' e a operação segue se quem agenda confirmar.
   */
  | 'outside-business-hours'
  /**
   * O horário cai dentro de um bloqueio explícito de `availability_exceptions`.
   *
   * **É recusa definitiva**, e a diferença com `outside-business-hours` é o
   * ponto: aquele é inferência sobre o horário padrão declarado; este é alguém
   * que digitou "25/12, clínica fechada" ou "férias da Dra. Ana". Deixar
   * confirmar por cima transformaria a decisão num aviso — e o bloqueio existe
   * exatamente para não depender de alguém lembrar. Para marcar assim mesmo,
   * remova o bloqueio.
   */
  | 'blocked-window'
  /**
   * O atendimento existe, mas não está mais no estado que a transição exige.
   *
   * Feature **A-03**. Não é `not-found` e não é `conflict`: a linha está lá e o
   * horário não é o problema — alguém mudou o status entre a tela carregar e o
   * clique chegar. Confundi-lo com `not-found` faria a recepção procurar um
   * atendimento que não sumiu.
   *
   * `currentStatus` viaja junto porque a mensagem útil é "já está confirmado",
   * e não "não deu certo".
   */
  | 'stale-status'
  /**
   * Desfecho pedido antes da hora marcada.
   *
   * Registrar falta para amanhã entraria na taxa de comparecimento como fato
   * observado. É recusa de regra, não de permissão.
   */
  | 'outcome-too-early'
  /** O alvo não existe — ou existe em outra clínica, o que dá no mesmo aqui. */
  | 'not-found'
  /** A policy de RLS recusou. Sessão sem direito sobre esta clínica. */
  | 'forbidden'
  /** O banco não respondeu, ou respondeu erro de transporte. */
  | 'unavailable'
  /** Qualquer outra recusa. */
  | 'unexpected'

export class AppointmentRepositoryError extends Error {
  readonly reason: AppointmentWriteFailure
  /** SQLSTATE ou código do driver. Log do servidor apenas. */
  readonly code?: string
  /**
   * Explicação exibível, quando existe.
   *
   * Só é preenchida quando o texto foi montado por ESTE código a partir de
   * configuração da clínica — "Sábado: a clínica atende das 08:00 às 12:00". A
   * regra que proíbe mostrar `message` continua valendo e não é contornada
   * aqui: `message` pode ecoar valores enviados ao Postgres, `userDetail`
   * nunca passou perto do banco.
   */
  readonly userDetail?: string
  /**
   * Status encontrado no banco quando `reason` é `'stale-status'`.
   *
   * É o que transforma "não foi possível" em "este atendimento já foi
   * cancelado". Sai do enum do banco, não de texto livre — não há valor de
   * usuário aqui para vazar.
   */
  readonly currentStatus?: AppointmentStatus

  constructor(
    reason: AppointmentWriteFailure,
    message: string,
    code?: string,
    userDetail?: string,
    currentStatus?: AppointmentStatus,
  ) {
    super(message)
    this.name = 'AppointmentRepositoryError'
    this.reason = reason
    this.code = code
    this.userDetail = userDetail
    this.currentStatus = currentStatus
  }
}

export function isAppointmentRepositoryError(
  cause: unknown,
): cause is AppointmentRepositoryError {
  return cause instanceof AppointmentRepositoryError
}
