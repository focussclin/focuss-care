import type { MembershipRole } from '@/lib/supabase/database.types'

import type {
  Employee,
  NewEmployeeData,
  NewTimeOffData,
  TimeOff,
} from './Employee'
import type {
  CreatedInvitation,
  PendingInvitation,
  TeamMember,
} from './TeamMember'

/**
 * PORTA da equipe.
 *
 * # Decisões de segurança
 *
 * Convites são emitidos por uma RPC `SECURITY DEFINER` no banco. A aplicação
 * nunca calcula `token_hash` e nunca lê esse hash; recebe o token cru somente no
 * momento da emissão, para montar o link que será entregue ao administrador.
 *
 * **Não há `remove`.** Tirar alguém da equipe é `revoke`: o vínculo continua na
 * base com `status = 'revoked'` e a data. Quem teve acesso a dado de saúde e
 * quando é informação que a clínica precisa manter, não apagar.
 */
export interface TeamRepository {
  /** Todos os vínculos da clínica, ativos e revogados. */
  listMembers(clinicId: string): Promise<TeamMember[]>

  /** Convites emitidos e ainda pendentes. Somente leitura — ver o JSDoc acima. */
  listPendingInvitations(clinicId: string): Promise<PendingInvitation[]>

  /** Emite um convite e devolve o token cru uma única vez. */
  createInvitation(
    clinicId: string,
    email: string,
    role: MembershipRole,
  ): Promise<CreatedInvitation>

  /**
   * Troca o papel de um membro.
   *
   * O adapter recusa rebaixar o ÚLTIMO `owner` da clínica: uma clínica sem dono
   * não tem quem gerencie a equipe nem quem responda pela assinatura, e o
   * caminho de volta exigiria suporte mexendo direto no banco.
   *
   * **Não recebe `actorUserId`**, ao contrário de `revoke`, e a assimetria é
   * proposital: trocar o próprio papel é legítimo — um sócio que deixa a
   * gestão e vira só profissional faz exatamente isso. O que não pode é a
   * clínica ficar sem dono, e disso cuida a regra do último `owner`.
   *
   * **Recebe `actorRole`**, e essa parte NÃO é simétrica com a de cima:
   * rebaixar-se é legítimo, promover-se não. `admin` tem `team.manage` e não
   * tem `record.read` — a matriz exclui `admin` de CLINICAL como controle de
   * LGPD. Sem esta regra, o `admin` se promove a `owner` e passa a ler o
   * prontuário de todo mundo: o controle era contornável por quem ele
   * restringia. Só `owner` concede `owner`.
   */
  changeRole(
    clinicId: string,
    membershipId: string,
    role: MembershipRole,
    actorRole: MembershipRole | null,
  ): Promise<TeamMember>

  /**
   * Revoga o acesso.
   *
   * Duas recusas que o adapter impõe, e as duas são sobre não deixar a clínica
   * inoperante:
   *
   *  - **Ninguém revoga a si mesmo.** Quem clica errado se tranca para fora, e
   *    só outro admin poderia trazer de volta.
   *  - **O último `owner` não é revogável.** Mesma razão de `changeRole`.
   */
  revoke(
    clinicId: string,
    membershipId: string,
    actorUserId: string,
  ): Promise<TeamMember>

  // ---------------------------------------------------------------------------
  // Vínculo trabalhista e ausências — feature S-02
  // ---------------------------------------------------------------------------

  /** Funcionários da clínica, ativos e desligados. */
  listEmployees(clinicId: string): Promise<Employee[]>

  /**
   * Cadastra o vínculo trabalhista.
   *
   * **Salário e CPF não entram** — ver o JSDoc de `Employee`.
   */
  createEmployee(clinicId: string, data: NewEmployeeData): Promise<Employee>

  /**
   * Ausências registradas, mais recentes primeiro.
   *
   * Não há `delete`: uma ausência cancelada continua na base com o status. O
   * histórico de quem faltou e quando é o que uma clínica precisa para
   * responder a questionamento trabalhista.
   */
  listTimeOff(clinicId: string, limit: number): Promise<TimeOff[]>

  /** Registra a ausência. Nasce em `requested`. */
  createTimeOff(
    clinicId: string,
    data: NewTimeOffData,
  ): Promise<TimeOff>

  /**
   * Aprova ou nega.
   *
   * Só ausência pendente aceita resposta — o mesmo desenho da guia de convênio
   * (V-01): reescrever uma decisão já tomada apaga quem a tomou e quando.
   */
  answerTimeOff(
    clinicId: string,
    timeOffId: string,
    approved: boolean,
    answeredBy: string,
  ): Promise<TimeOff>

  /**
   * **NÃO há escalas de trabalho.**
   *
   * `work_schedules` existe e tem `weekday: number`, sem convenção verificável
   * deste ambiente — exatamente o bloqueio **P-WD** que impediu a
   * disponibilidade por profissional em A-02. Errar entre 0–6 e 1–7 desloca a
   * semana inteira em um dia, e uma escala deslocada põe alguém para trabalhar
   * no dia errado. A consulta que resolve está no roadmap.
   *
   * Ausências não sofrem disso: `time_off` usa datas (`starts_on`, `ends_on`),
   * não dia da semana. Foi o que permitiu entregar uma sem a outra.
   */
}
