import type { MembershipRole } from '@/lib/supabase/database.types'

import type { PendingInvitation, TeamMember } from './TeamMember'

/**
 * PORTA da equipe.
 *
 * # O que NÃO está aqui
 *
 * **Não há `invite`.** `invitations` guarda `token_hash` e o schema remoto não
 * expõe RPC de criação; emitir exigiria a aplicação conhecer o algoritmo de
 * comparação, e quem sabe gerar hash válido sabe forjar convite. Um método aqui
 * seria uma promessa que o adapter não pode cumprir — a ausência é deliberada,
 * e a tela diz por quê em vez de mostrar um botão quebrado.
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
   */
  changeRole(
    clinicId: string,
    membershipId: string,
    role: MembershipRole,
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
}
