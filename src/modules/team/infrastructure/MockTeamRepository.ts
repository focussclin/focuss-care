import { currentUser, professionals } from '@/lib/mocks/clinic-data'

import type { PendingInvitation, TeamMember } from '../domain/TeamMember'
import type { TeamRepository } from '../domain/TeamRepository'
import { TeamRepositoryError } from '../domain/TeamRepositoryError'

/**
 * Fallback usado enquanto o Supabase nao esta configurado.
 *
 * A equipe de demonstracao sai dos profissionais ja existentes em
 * `clinic-data`, mais o usuario atual como `owner` — nao ha lista de equipe
 * ficticia nova sendo inventada.
 */
export class MockTeamRepository implements TeamRepository {
  async listMembers(): Promise<TeamMember[]> {
    const owner: TeamMember = {
      id: 'membership-mock-owner',
      userId: 'user-mock-owner',
      name: currentUser.name,
      email: 'demo@focusscare.local',
      role: 'owner',
      status: 'active',
      professional: null,
      acceptedAt: new Date(2026, 0, 15),
      createdAt: new Date(2026, 0, 15),
    }

    return [
      owner,
      ...professionals.map((professional, index) => ({
        id: `membership-mock-${professional.id}`,
        userId: `user-mock-${professional.id}`,
        name: professional.name,
        email: `${professional.id}@focusscare.local`,
        role: 'professional' as const,
        status: 'active' as const,
        professional: {
          id: professional.id,
          specialties: [professional.specialty],
        },
        acceptedAt: new Date(2026, 1, index + 1),
        createdAt: new Date(2026, 1, index + 1),
      })),
    ]
  }

  /** Sem banco nao ha convite emitido — a lista vazia e a resposta honesta. */
  async listPendingInvitations(): Promise<PendingInvitation[]> {
    return []
  }

  /** Convites alteram acesso e exigem persistência real no Supabase. */
  async createInvitation(): Promise<never> {
    return this.refuseWrite('createInvitation')
  }

  /**
   * Escrita nao existe na demonstracao.
   *
   * Devolver um objeto daria "acesso revogado" para algo que nao saiu da
   * memoria do processo — e revogacao de acesso e exatamente o tipo de coisa
   * que alguem confere uma vez e confia depois.
   */
  async changeRole(): Promise<never> {
    return this.refuseWrite('changeRole')
  }

  async revoke(): Promise<never> {
    return this.refuseWrite('revoke')
  }

  /**
   * Sem funcionario e sem ausencia na demonstracao.
   *
   * Diferente da equipe, que deriva dos profissionais ficticios, nao ha vinculo
   * trabalhista de exemplo em `clinic-data` — e inventar um faria a tela
   * oferecer registrar ferias de alguem que nao existe.
   */
  async listEmployees(): Promise<[]> {
    return []
  }

  async listTimeOff(): Promise<[]> {
    return []
  }

  async createEmployee(): Promise<never> {
    return this.refuseWrite('createEmployee')
  }

  async createTimeOff(): Promise<never> {
    return this.refuseWrite('createTimeOff')
  }

  async answerTimeOff(): Promise<never> {
    return this.refuseWrite('answerTimeOff')
  }

  private refuseWrite(operation: string): never {
    throw new TeamRepositoryError(
      'unavailable',
      `MockTeamRepository nao persiste (${operation}): escrita real exige Supabase configurado.`,
    )
  }
}
