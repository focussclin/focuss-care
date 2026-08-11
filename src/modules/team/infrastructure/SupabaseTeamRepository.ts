import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  ContractType,
  Database,
  MembershipRole,
  TimeOffKind,
  TimeOffStatus,
} from '@/lib/supabase/database.types'

import type {
  Employee,
  NewEmployeeData,
  NewTimeOffData,
  TimeOff,
} from '../domain/Employee'
import {
  isEmployed,
  refuseHireDate,
  refuseTermination,
} from '../domain/Employee'
import type {
  CreatedInvitation,
  MembershipStatus,
  PendingInvitation,
  TeamMember,
} from '../domain/TeamMember'
import type { TeamRepository } from '../domain/TeamRepository'
import { TeamRepositoryError } from '../domain/TeamRepositoryError'

type Client = SupabaseClient<Database>

const MEMBER_SELECT = `
  id,
  user_id,
  role,
  status,
  accepted_at,
  created_at,
  profiles ( full_name, email )
`

interface MemberJoinRow {
  id: string
  user_id: string
  role: MembershipRole
  status: MembershipStatus
  accepted_at: string | null
  created_at: string
  profiles: { full_name: string; email: string } | null
}

/**
 * Adapter Supabase da equipe.
 *
 * Toda escrita filtra `clinic_id` explicitamente. A RLS impede o vazamento; o
 * filtro impede a operação errada — e transforma "linha de outra clínica" em
 * "não encontrado" em vez de "atualizou zero linhas em silêncio".
 */
/**
 * Colunas do vinculo trabalhista que a aplicacao le.
 *
 * `salary_cents` e `cpf` continuam FORA, e a ausencia e deliberada: salario e o
 * dado mais sensivel de uma folha, o produto nao tem folha, e o que nao sai do
 * banco nao vaza para log nenhum.
 */
const EMPLOYEE_COLUMNS =
  'id, full_name, role_title, contract_type, is_active, professional_id, hire_date, termination_date'

interface EmployeeRow {
  id: string
  full_name: string
  role_title: string | null
  contract_type: string
  is_active: boolean
  professional_id: string | null
  hire_date: string | null
  termination_date: string | null
}

/**
 * Linha -> entidade.
 *
 * `isActive` sai da DATA, e nao da coluna booleana: uma linha com desligamento
 * registrado e `is_active = true` foi escrita fora do produto, e o desligamento
 * vence. Mostrar "Ativo" sobre alguem com data de saida seria a tela
 * contradizendo o banco.
 *
 * A data e dia de calendario ('YYYY-MM-DD'). A hora local explicita evita que o
 * fuso do servidor devolva o dia anterior — mesma armadilha de `birth_date`.
 */
function toEmployee(row: EmployeeRow): Employee {
  const terminationDate = row.termination_date
    ? new Date(`${row.termination_date}T00:00:00`)
    : null

  return {
    id: row.id,
    fullName: row.full_name,
    roleTitle: row.role_title,
    contractType: row.contract_type as ContractType,
    isActive: row.is_active && isEmployed(terminationDate),
    hireDate: row.hire_date ? new Date(`${row.hire_date}T00:00:00`) : null,
    terminationDate,
    professionalId: row.professional_id,
  }
}

export class SupabaseTeamRepository implements TeamRepository {
  constructor(private readonly client: Client) {}

  async createInvitation(
    _clinicId: string,
    email: string,
    role: MembershipRole,
  ): Promise<CreatedInvitation> {
    /*
     * A RPC resolve a clínica e o administrador a partir da sessão. O
     * `clinicId` permanece na porta por consistência com os demais casos de uso,
     * mas não é aceito pelo banco vindo do cliente.
     */
    const { data, error } = await this.client.rpc('create_invitation', {
      p_email: email,
      p_role: role,
    })

    if (error) throw toWriteError(error)

    // O retorno é text e o token só pode aparecer aqui. Nunca logar este valor.
    if (typeof data !== 'string' || data.length < 16) {
      throw new TeamRepositoryError(
        'unexpected',
        'RPC de convite devolveu um token inválido',
      )
    }

    return {
      token: data,
      // O prazo é o default definido pela RPC. A listagem posterior usa a data
      // gravada pelo banco como fonte de verdade.
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }
  }

  async listMembers(clinicId: string): Promise<TeamMember[]> {
    const { data, error } = await this.client
      .from('memberships')
      .select(MEMBER_SELECT)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: true })

    if (error) throw readFailure('listMembers', error)

    const rows = data as unknown as MemberJoinRow[]

    /*
     * Os cadastros de profissional vêm numa consulta separada, e não por join.
     * `professionals.user_id` é nullable — um profissional pode existir sem
     * login (agenda de quem ainda não usa o sistema), então a relação não é
     * um-para-um e um join embutido traria linhas duplicadas ou faltantes.
     */
    const professionals = await this.loadProfessionals(clinicId)

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.profiles?.full_name ?? 'Membro da equipe',
      email: row.profiles?.email ?? '',
      role: row.role,
      status: row.status,
      professional: professionals.get(row.user_id) ?? null,
      acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
      createdAt: new Date(row.created_at),
    }))
  }

  private async loadProfessionals(
    clinicId: string,
  ): Promise<Map<string, { id: string; specialties: readonly string[] }>> {
    const result = new Map<
      string,
      { id: string; specialties: readonly string[] }
    >()

    const { data, error } = await this.client
      .from('professionals')
      .select('id, user_id, specialties')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)

    if (error) {
      // Cadastro profissional é enriquecimento: sem ele a lista de equipe
      // continua correta, só não mostra a especialidade.
      console.error('[team] loadProfessionals', {
        code: error.code ?? null,
        message: error.message ?? null,
      })
      return result
    }

    for (const row of data ?? []) {
      if (row.user_id) {
        result.set(row.user_id, {
          id: row.id,
          specialties: row.specialties ?? [],
        })
      }
    }

    return result
  }

  async listPendingInvitations(
    clinicId: string,
  ): Promise<PendingInvitation[]> {
    const { data, error } = await this.client
      .from('invitations')
      .select('id, email, role, expires_at, created_at')
      .eq('clinic_id', clinicId)
      // Aceito, revogado ou expirado não é pendente.
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (error) throw readFailure('listPendingInvitations', error)

    /*
     * `token_hash` NÃO está no select, de propósito. Ele não serve a nada na
     * tela e é o material de que um convite é feito — trazê-lo para o servidor
     * de aplicação, e daí possivelmente para um log, é risco sem contrapartida.
     */
    return (data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
    }))
  }

  async changeRole(
    clinicId: string,
    membershipId: string,
    role: MembershipRole,
    actorRole: MembershipRole | null,
  ): Promise<TeamMember> {
    /*
     * Ninguem concede o papel que nao tem.
     *
     * `admin` tem `team.manage` e nao tem `record.read`. Sem esta linha, ele
     * se promove a `owner` e le o prontuario de todo mundo — o controle de
     * LGPD da matriz de permissoes era contornavel por quem ele restringia.
     * Vem ANTES de qualquer leitura: recusar cedo nao toca o banco.
     */
    if (role === 'owner' && actorRole !== 'owner') {
      throw new TeamRepositoryError(
        'role-escalation',
        'tentativa de conceder owner sem ser owner',
      )
    }

    const target = await this.requireMembership(clinicId, membershipId)

    // Rebaixar o último dono deixa a clínica sem quem a administre.
    if (target.role === 'owner' && role !== 'owner') {
      await this.requireAnotherOwner(clinicId, membershipId)
    }

    const { data: row, error } = await this.client
      .from('memberships')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', membershipId)
      .select(MEMBER_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(membershipId)

    return this.hydrate(clinicId, row as unknown as MemberJoinRow)
  }

  async revoke(
    clinicId: string,
    membershipId: string,
    actorUserId: string,
  ): Promise<TeamMember> {
    const target = await this.requireMembership(clinicId, membershipId)

    if (target.user_id === actorUserId) {
      throw new TeamRepositoryError(
        'self-revoke',
        'tentativa de revogar o proprio vinculo',
      )
    }

    if (target.role === 'owner') {
      await this.requireAnotherOwner(clinicId, membershipId)
    }

    const now = new Date().toISOString()

    const { data: row, error } = await this.client
      .from('memberships')
      .update({ status: 'revoked', revoked_at: now, updated_at: now })
      .eq('clinic_id', clinicId)
      .eq('id', membershipId)
      // Revogar duas vezes sobrescreveria a data da primeira revogação, e é
      // ela que responde "desde quando esta pessoa não tem mais acesso".
      .neq('status', 'revoked')
      .select(MEMBER_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(membershipId)

    return this.hydrate(clinicId, row as unknown as MemberJoinRow)
  }

  // ---------------------------------------------------------------------------
  // Vínculo trabalhista e ausências — feature S-02
  // ---------------------------------------------------------------------------

  async listEmployees(clinicId: string): Promise<Employee[]> {
    const { data, error } = await this.client
      .from('employees')
      .select(EMPLOYEE_COLUMNS)
      .eq('clinic_id', clinicId)
      .order('full_name', { ascending: true })
      .limit(200)

    if (error) throw readFailure('listEmployees', error)

    // `salary_cents` e `cpf` continuam fora do select — ver `EMPLOYEE_COLUMNS`.
    return (data ?? []).map((row) => toEmployee(row as EmployeeRow))
  }

  async createEmployee(
    clinicId: string,
    data: NewEmployeeData,
  ): Promise<Employee> {
    const { data: row, error } = await this.client
      .from('employees')
      .insert({
        clinic_id: clinicId,
        full_name: data.fullName,
        role_title: data.roleTitle,
        contract_type: data.contractType,
        professional_id: data.professionalId,
        hire_date: data.hireDate ? toDateOnly(data.hireDate) : null,
        is_active: true,
      })
      .select(EMPLOYEE_COLUMNS)
      .single()

    if (error) throw toWriteError(error)

    return toEmployee(row as EmployeeRow)
  }

  /**
   * Registra o desligamento, ou o reverte com `null`.
   *
   * A leitura previa existe pela regra: recusar data anterior a admissao exige
   * conhecer a admissao, e ela esta na linha. E a mesma leitura que responde
   * `not-found` antes de escrever — paciente de outra clinica e paciente
   * inexistente dao no mesmo aqui.
   */
  async setEmployeeTermination(
    clinicId: string,
    employeeId: string,
    terminationDate: Date | null,
  ): Promise<Employee> {
    const { data: current, error: readError } = await this.client
      .from('employees')
      .select('hire_date')
      .eq('clinic_id', clinicId)
      .eq('id', employeeId)
      .maybeSingle()

    if (readError) throw toWriteError(readError)
    if (!current) {
      throw new TeamRepositoryError(
        'not-found',
        `nenhum funcionario ${employeeId} na clinica ativa`,
      )
    }

    if (terminationDate) {
      const hireDate = current.hire_date
        ? new Date(`${current.hire_date}T00:00:00`)
        : null

      const refusal = refuseTermination(hireDate, terminationDate, new Date())

      if (refusal) {
        throw new TeamRepositoryError(
          refusal === 'in-future'
            ? 'termination-in-future'
            : 'termination-before-hire',
          `desligamento recusado: ${refusal}`,
        )
      }
    }

    const { data: row, error } = await this.client
      .from('employees')
      .update({
        termination_date: terminationDate ? toDateOnly(terminationDate) : null,
        /*
         * A coluna booleana continua sendo escrita, e SEMPRE a partir da data:
         * e o que impede a linha "ativo, desligado em 12/03" de existir.
         */
        is_active: isEmployed(terminationDate),
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId)
      .eq('id', employeeId)
      .select(EMPLOYEE_COLUMNS)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) {
      throw new TeamRepositoryError(
        'forbidden',
        'o funcionario e legivel mas a escrita foi recusada',
      )
    }

    return toEmployee(row as EmployeeRow)
  }

  async updateEmployeeHireDate(
    clinicId: string,
    employeeId: string,
    hireDate: Date | null,
  ): Promise<Employee> {
    const { data: current, error: readError } = await this.client
      .from('employees')
      .select('termination_date')
      .eq('clinic_id', clinicId)
      .eq('id', employeeId)
      .maybeSingle()

    if (readError) throw toWriteError(readError)
    if (!current) {
      throw new TeamRepositoryError(
        'not-found',
        `nenhum funcionario ${employeeId} na clinica ativa`,
      )
    }

    const terminationDate = current.termination_date
      ? new Date(`${current.termination_date}T00:00:00`)
      : null
    const refusal = refuseHireDate(hireDate, terminationDate)

    if (refusal) {
      throw new TeamRepositoryError(
        'hire-after-termination',
        `admissao recusada: ${refusal}`,
      )
    }

    const { data: row, error } = await this.client
      .from('employees')
      .update({
        hire_date: hireDate ? toDateOnly(hireDate) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId)
      .eq('id', employeeId)
      .select(EMPLOYEE_COLUMNS)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) {
      throw new TeamRepositoryError(
        'forbidden',
        'o funcionario e legivel mas a escrita foi recusada',
      )
    }

    return toEmployee(row as EmployeeRow)
  }

  async listTimeOff(clinicId: string, limit: number): Promise<TimeOff[]> {
    const { data, error } = await this.client
      .from('time_off')
      .select(
        'id, employee_id, kind, status, starts_on, ends_on, reason, approved_at, employees ( full_name )',
      )
      .eq('clinic_id', clinicId)
      .order('starts_on', { ascending: false })
      .limit(limit)

    if (error) throw readFailure('listTimeOff', error)

    const rows = data as unknown as {
      id: string
      employee_id: string
      kind: TimeOffKind
      status: TimeOffStatus
      starts_on: string
      ends_on: string
      reason: string | null
      approved_at: string | null
      employees: { full_name: string } | null
    }[]

    return rows.map(toTimeOff)
  }

  async createTimeOff(
    clinicId: string,
    data: NewTimeOffData,
  ): Promise<TimeOff> {
    const { data: row, error } = await this.client
      .from('time_off')
      .insert({
        clinic_id: clinicId,
        employee_id: data.employeeId,
        kind: data.kind,
        // Nasce pendente: quem pede e quem aprova sao pessoas diferentes.
        status: 'requested',
        starts_on: toDateOnly(data.startsOn),
        ends_on: toDateOnly(data.endsOn),
        reason: data.reason,
      })
      .select(
        'id, employee_id, kind, status, starts_on, ends_on, reason, approved_at, employees ( full_name )',
      )
      .single()

    if (error) throw toWriteError(error)

    return toTimeOff(row as never)
  }

  async answerTimeOff(
    clinicId: string,
    timeOffId: string,
    approved: boolean,
    answeredBy: string,
  ): Promise<TimeOff> {
    const now = new Date().toISOString()

    const { data, error } = await this.client
      .from('time_off')
      .update({
        status: approved ? 'approved' : 'denied',
        approved_by: answeredBy,
        approved_at: now,
        updated_at: now,
      })
      .eq('clinic_id', clinicId)
      .eq('id', timeOffId)
      /*
       * Só pendente aceita resposta.
       *
       * Reescrever uma decisão já tomada apaga quem a tomou e quando — e é
       * exatamente esse registro que uma clínica precisa ter se a ausência
       * virar questionamento trabalhista. O filtro também impede que duas
       * pessoas respondendo ao mesmo tempo se sobrescrevam.
       */
      .eq('status', 'requested')
      .select(
        'id, employee_id, kind, status, starts_on, ends_on, reason, approved_at, employees ( full_name )',
      )
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) {
      throw new TeamRepositoryError(
        'not-found',
        `ausencia ${timeOffId} nao esta pendente nesta clinica`,
      )
    }

    return toTimeOff(data as never)
  }

  private async requireMembership(
    clinicId: string,
    membershipId: string,
  ): Promise<{ user_id: string; role: MembershipRole }> {
    const { data, error } = await this.client
      .from('memberships')
      .select('user_id, role')
      .eq('clinic_id', clinicId)
      .eq('id', membershipId)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) throw notFound(membershipId)

    return data
  }

  /**
   * Existe OUTRO `owner` ativo além deste?
   *
   * A contagem exclui o próprio alvo (`neq('id', ...)`) — perguntar "quantos
   * owners há?" e comparar com 1 daria o número errado no instante em que dois
   * administradores agissem ao mesmo tempo.
   */
  private async requireAnotherOwner(
    clinicId: string,
    membershipId: string,
  ): Promise<void> {
    const { count, error } = await this.client
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('role', 'owner')
      .eq('status', 'active')
      .neq('id', membershipId)

    if (error) throw toWriteError(error)

    if ((count ?? 0) === 0) {
      throw new TeamRepositoryError(
        'last-owner',
        'ultimo owner ativo da clinica',
      )
    }
  }

  private async hydrate(
    clinicId: string,
    row: MemberJoinRow,
  ): Promise<TeamMember> {
    const professionals = await this.loadProfessionals(clinicId)

    return {
      id: row.id,
      userId: row.user_id,
      name: row.profiles?.full_name ?? 'Membro da equipe',
      email: row.profiles?.email ?? '',
      role: row.role,
      status: row.status,
      professional: professionals.get(row.user_id) ?? null,
      acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
      createdAt: new Date(row.created_at),
    }
  }
}

function toTimeOff(row: {
  id: string
  employee_id: string
  kind: TimeOffKind
  status: TimeOffStatus
  starts_on: string
  ends_on: string
  reason: string | null
  approved_at: string | null
  employees: { full_name: string } | null
}): TimeOff {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employees?.full_name ?? 'Funcionário',
    kind: row.kind,
    status: row.status,
    // `date` do Postgres, sem fuso: 'T00:00:00' evita o recuo de um dia que
    // `new Date('2026-08-10')` produz ao interpretar como UTC.
    startsOn: new Date(`${row.starts_on}T00:00:00`),
    endsOn: new Date(`${row.ends_on}T00:00:00`),
    reason: row.reason,
    answeredAt: row.approved_at ? new Date(row.approved_at) : null,
  }
}

/** `Date` -> 'YYYY-MM-DD' local. `starts_on`/`ends_on` são `date`. */
function toDateOnly(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function notFound(membershipId: string): TeamRepositoryError {
  return new TeamRepositoryError(
    'not-found',
    `nenhum vinculo ${membershipId} na clinica ativa`,
  )
}

function readFailure(
  context: string,
  error: { code?: string | null; message?: string | null },
): Error {
  console.error(`[team] ${context}`, {
    code: error.code ?? null,
    message: error.message ?? null,
  })

  return new Error('Falha ao carregar a equipe.')
}

/**
 * Traduz a recusa do Postgres.
 *
 * A mensagem sobe só para o LOG. Em `memberships` e `profiles` o texto de erro
 * pode ecoar e-mail e nome de pessoa — dado pessoal, ainda que não clínico.
 */
function toWriteError(error: {
  code?: string | null
  message?: string | null
}): TeamRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  if (code === '42501' || code === 'PGRST301') {
    return new TeamRepositoryError('forbidden', message, code)
  }

  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new TeamRepositoryError('unavailable', message)
  }

  return new TeamRepositoryError('unexpected', message, code)
}
