import type { PatientRow } from '@/lib/supabase/database.types'
import { formatPhone } from '@/lib/utils/phone'
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
 *  - preferencia de contato ainda nao existe no schema, entao fica indefinida;
 *  - o telefone e guardado so em digitos (ver `lib/utils/phone`) e formatado aqui,
 *    na leitura. Valor fora do padrao brasileiro volta como esta no banco — linha
 *    vinda de importacao nao pode ser mutilada pela tela.
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
    phone: row.phone ? formatPhone(row.phone) : '',
    // 'YYYY-MM-DD' sozinho e interpretado como meia-noite UTC, e a tela, no fuso
    // do Brasil, mostraria o dia anterior. A hora local explicita faz a data lida
    // ser a mesma que foi digitada no cadastro.
    birthDate: row.birth_date ? new Date(`${row.birth_date}T00:00:00`) : null,
    document: row.cpf ?? undefined,
    contactPreference: undefined,
    adminNotes: row.admin_notes,
    status: row.is_active ? 'active' : 'inactive',
    createdAt: new Date(row.created_at),
    lastVisitAt: relations.lastVisitAt ?? null,
    nextVisitAt: relations.nextVisitAt ?? null,
  }
}
