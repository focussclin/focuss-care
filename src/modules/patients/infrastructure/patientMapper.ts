import type { PatientRow } from '@/lib/supabase/database.types'
import type { Patient } from '@/modules/_shared/domain/types'

/**
 * Traduz a linha do banco para a entidade do dominio.
 *
 * Unico lugar do modulo que conhece nomes de coluna. Sem ele, o formato do banco
 * vazaria para dentro dos componentes.
 *
 * Diferencas conhecidas entre schema e dominio:
 *  - o banco guarda `is_active` (booleano), nao um enum de tres estados; o estado
 *    'follow-up' previsto no handoff ainda nao tem coluna correspondente;
 *  - `document` vem de `cpf`;
 *  - preferencia de contato ainda nao existe no schema, entao fica indefinida.
 */
export function toPatient(
  row: PatientRow,
  relations: {
    lastVisitAt?: Date | null
    nextVisitAt?: Date | null
  } = {},
): Patient {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email ?? '',
    phone: row.phone ?? '',
    birthDate: row.birth_date ? new Date(row.birth_date) : null,
    document: row.cpf ?? undefined,
    contactPreference: undefined,
    status: row.is_active ? 'active' : 'inactive',
    createdAt: new Date(row.created_at),
    lastVisitAt: relations.lastVisitAt ?? null,
    nextVisitAt: relations.nextVisitAt ?? null,
  }
}
