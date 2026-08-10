import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  AvailabilityException,
  NewAvailabilityExceptionData,
} from '../domain/AvailabilityException'
import {
  AvailabilityExceptionError,
  type AvailabilityExceptionRepository,
} from '../domain/AvailabilityExceptionRepository'

type Client = SupabaseClient<Database>

const EXCEPTION_SELECT =
  'id, clinic_id, professional_id, kind, starts_at, ends_at, reason, created_at, professional:professionals ( id, full_name )'

const EXCEPTION_CAP = 200

interface ExceptionRow {
  id: string
  professional_id: string | null
  kind: AvailabilityException['kind']
  starts_at: string
  ends_at: string
  reason: string | null
  created_at: string
  professional: { id: string; full_name: string } | null
}

function toException(row: ExceptionRow): AvailabilityException {
  return {
    id: row.id,
    professionalId: row.professional_id,
    professionalName: row.professional?.full_name ?? null,
    kind: row.kind,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    reason: row.reason,
    createdAt: new Date(row.created_at),
  }
}

export class SupabaseAvailabilityExceptionRepository
  implements AvailabilityExceptionRepository
{
  constructor(private readonly client: Client) {}

  /**
   * Só o que ainda pode afetar alguma decisão.
   *
   * `ends_at >= from` corta o passado: uma exceção encerrada não bloqueia nem
   * libera nada, e trazê-la empurraria as vigentes para fora do teto de linhas
   * — a lista ficaria cheia de feriados do ano passado enquanto o de amanhã não
   * apareceria.
   */
  async listUpcoming(clinicId: string, from: Date): Promise<AvailabilityException[]> {
    const { data, error } = await this.client
      .from('availability_exceptions')
      .select(EXCEPTION_SELECT)
      .eq('clinic_id', clinicId)
      .gte('ends_at', from.toISOString())
      .order('starts_at', { ascending: true })
      .limit(EXCEPTION_CAP)

    if (error) throw toAvailabilityError(error)
    return (data ?? []).map((row) => toException(row as unknown as ExceptionRow))
  }

  /**
   * Atendimentos vivos dentro da janela.
   *
   * Cancelado não conta: bloquear por cima de um cancelamento não deixa
   * ninguém sem horário. (`canceled`, com um L só — é a grafia do enum do
   * banco, e o typecheck é quem lembra disso.) As bordas são abertas, como na constraint de
   * sobreposição de `appointments` — quem termina 12:00 não colide com a janela
   * que começa 12:00.
   */
  async countAppointmentsIn(
    clinicId: string,
    startsAt: Date,
    endsAt: Date,
    professionalId: string | null,
  ): Promise<number> {
    let query = this.client
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .neq('status', 'canceled')
      .lt('starts_at', endsAt.toISOString())
      .gt('ends_at', startsAt.toISOString())

    if (professionalId !== null) {
      query = query.eq('professional_id', professionalId)
    }

    const { count, error } = await query

    if (error) throw toAvailabilityError(error)
    return count ?? 0
  }

  async create(
    clinicId: string,
    createdBy: string,
    data: NewAvailabilityExceptionData,
  ): Promise<AvailabilityException> {
    const { data: row, error } = await this.client
      .from('availability_exceptions')
      .insert({
        clinic_id: clinicId,
        professional_id: data.professionalId,
        kind: data.kind,
        starts_at: data.startsAt.toISOString(),
        ends_at: data.endsAt.toISOString(),
        reason: data.reason,
        created_by: createdBy,
      })
      .select(EXCEPTION_SELECT)
      .single()

    if (error) throw toAvailabilityError(error)
    if (!row) throw new AvailabilityExceptionError('unexpected', 'insert sem retorno')
    return toException(row as unknown as ExceptionRow)
  }

  /**
   * Exceção PODE ser removida — ao contrário de alergia.
   *
   * Um bloqueio é configuração operacional, não afirmação clínica: apagar o
   * feriado cadastrado errado não apaga história de ninguém. O que fica na
   * trilha é o evento de auditoria da remoção.
   */
  async remove(clinicId: string, exceptionId: string): Promise<void> {
    const { data, error } = await this.client
      .from('availability_exceptions')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('id', exceptionId)
      .select('id')
      .maybeSingle()

    if (error) throw toAvailabilityError(error)
    if (data) return

    // Zero linhas não diz sozinho se a exceção sumiu ou se falta policy.
    const { data: existing, error: readError } = await this.client
      .from('availability_exceptions')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', exceptionId)
      .maybeSingle()

    if (readError) throw toAvailabilityError(readError)
    if (existing) {
      throw new AvailabilityExceptionError(
        'write-forbidden',
        'a exceção é legível mas a remoção foi recusada',
      )
    }
    throw new AvailabilityExceptionError('not-found', 'exceção indisponível nesta clínica')
  }
}

function toAvailabilityError(error: {
  code?: string | null
  message?: string | null
}): AvailabilityExceptionError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  if (code === '42501' || code === 'PGRST301') {
    return new AvailabilityExceptionError('forbidden', 'recusado pela policy', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new AvailabilityExceptionError('unavailable', 'falha de conexão', code)
  }
  return new AvailabilityExceptionError('unexpected', 'falha ao acessar exceções', code)
}
