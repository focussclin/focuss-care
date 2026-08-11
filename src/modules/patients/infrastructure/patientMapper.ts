import { z } from 'zod'

import type { PatientRow } from '@/lib/supabase/database.types'
import { formatPhone } from '@/lib/utils/phone'
import type { EmergencyContact, Patient } from '@/modules/_shared/domain/types'

/**
 * A forma FECHADA do contato de emergencia.
 *
 * Sem `passthrough`: chave desconhecida e sinal de que a linha foi escrita por
 * outra coisa, e aceitar o excedente arrastaria conteudo nao validado para
 * dentro do dominio.
 */
const emergencyContactShape = z
  .object({
    name: z.string().trim().min(1).max(160),
    phone: z.string().trim().max(20).nullable().optional(),
    relationship: z.string().trim().max(60).nullable().optional(),
  })
  .strict()

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
  const emergency = readEmergencyContact(row.emergency_contact)

  return {
    id: row.id,
    name: row.full_name,
    socialName: row.social_name ?? null,
    email: row.email ?? '',
    phone: row.phone ? formatPhone(row.phone) : '',
    phoneAlt: row.phone_alt ? formatPhone(row.phone_alt) : '',
    biologicalSex: row.biological_sex,
    genderIdentity: row.gender_identity ?? null,
    emergencyContact: emergency.contact,
    emergencyContactUnreadable: emergency.unreadable,
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

/**
 * Relê `patients.emergency_contact` contra a forma que a aplicação grava.
 *
 * A coluna é `jsonb` e aceita qualquer coisa. Confiar no que vier de lá seria
 * deixar uma linha escrita fora do produto virar um objeto com o formato errado
 * dentro do domínio — e o erro apareceria três camadas adiante, na tela.
 *
 * Conteúdo que não casa **não vira `null` em silêncio**: a coluna tem dado, e
 * mostrar "sem contato" sobre um contato que existe é mentira. O sinalizador
 * deixa a ficha avisar que salvar vai substituí-lo.
 */
function readEmergencyContact(value: unknown): {
  contact: EmergencyContact | null
  unreadable: boolean
} {
  if (value === null || value === undefined) {
    return { contact: null, unreadable: false }
  }

  // `{}` é o que uma coluna "vazia" costuma guardar, e não é dado ilegível.
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0
  ) {
    return { contact: null, unreadable: false }
  }

  const parsed = emergencyContactShape.safeParse(value)
  if (!parsed.success) {
    console.error('[patients] emergency_contact fora da forma esperada')
    return { contact: null, unreadable: true }
  }

  return {
    contact: {
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      relationship: parsed.data.relationship ?? null,
    },
    unreadable: false,
  }
}
