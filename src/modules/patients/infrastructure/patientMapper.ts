import { z } from 'zod'

import type { PatientRow } from '@/lib/supabase/database.types'
import { formatPhone } from '@/lib/utils/phone'
import type {
  EmergencyContact,
  Patient,
  PatientAddress,
} from '@/modules/_shared/domain/types'

import { BRAZILIAN_STATES } from '../domain/PatientDocuments'

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
 * A forma FECHADA do endereço.
 *
 * `patients.address` é `jsonb` NOT NULL e até esta fatia guardava `{}` em toda
 * linha. Sem `passthrough` pelo mesmo motivo do contato de emergência: chave
 * desconhecida é sinal de que a linha foi escrita por outra coisa.
 *
 * `state` é conferido contra a lista fechada de UFs — uma sigla inventada
 * chegaria à etiqueta de correspondência e à guia do convênio.
 */
const addressShape = z
  .object({
    zip: z.string().trim().max(8).nullable().optional(),
    street: z.string().trim().max(160).nullable().optional(),
    number: z.string().trim().max(20).nullable().optional(),
    complement: z.string().trim().max(80).nullable().optional(),
    district: z.string().trim().max(80).nullable().optional(),
    city: z.string().trim().max(80).nullable().optional(),
    state: z
      .enum(BRAZILIAN_STATES)
      .nullable()
      .optional(),
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
 *  - `cpf` e `cns` viajam em DIGITOS: a mascara e da tela, e guardar formatado
 *    faria a mesma pessoa existir duas vezes na base;
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
  const address = readAddress(row.address)

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
    cpf: row.cpf ?? null,
    cns: row.cns ?? null,
    address: address.address,
    addressUnreadable: address.unreadable,
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

/**
 * Relê `patients.address` contra a forma que a aplicação grava.
 *
 * `{}` é o estado de TODA linha criada antes desta fatia — o insert gravava o
 * objeto vazio porque a coluna é NOT NULL. Ele é "sem endereço", não dado
 * ilegível: tratá-lo como corrompido faria a base inteira acusar um problema que
 * não existe.
 *
 * Endereço sem rua, cidade e UF também vira `null`: a forma casa, mas o conteúdo
 * não localiza ninguém. Ver `hasMinimumAddress` — a mesma regra que o schema
 * aplica na escrita, aplicada de novo na leitura, porque a linha pode ter sido
 * escrita antes dela existir.
 */
function readAddress(value: unknown): {
  address: PatientAddress | null
  unreadable: boolean
} {
  if (value === null || value === undefined) {
    return { address: null, unreadable: false }
  }

  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0
  ) {
    return { address: null, unreadable: false }
  }

  const parsed = addressShape.safeParse(value)
  if (!parsed.success) {
    console.error('[patients] address fora da forma esperada')
    return { address: null, unreadable: true }
  }

  const address: PatientAddress = {
    zip: parsed.data.zip ?? null,
    street: parsed.data.street ?? null,
    number: parsed.data.number ?? null,
    complement: parsed.data.complement ?? null,
    district: parsed.data.district ?? null,
    city: parsed.data.city ?? null,
    state: parsed.data.state ?? null,
  }

  const hasAnyField = Object.values(address).some(
    (field) => field !== null && field !== '',
  )

  if (!hasAnyField) return { address: null, unreadable: false }

  return { address, unreadable: false }
}
