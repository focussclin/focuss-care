import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/supabase/database.types'

import type {
  MessageTemplate,
  NewMessageTemplateData,
} from '../domain/MessageTemplate'
import { extractVariables, TEMPLATE_LANGUAGE } from '../domain/MessageTemplate'
import {
  MessageTemplateError,
  type MessageTemplateRepository,
} from '../domain/MessageTemplateRepository'

type Client = SupabaseClient<Database>

const TEMPLATE_SELECT =
  'id, clinic_id, name, category, language, body, variables, provider_template_id, is_approved, is_active, updated_at'

const TEMPLATE_CAP = 200

interface TemplateRow {
  id: string
  name: string
  category: string | null
  language: string
  body: string
  variables: Json
  provider_template_id: string | null
  is_approved: boolean
  is_active: boolean
  updated_at: string
}

/**
 * As variáveis são recalculadas do CORPO na leitura.
 *
 * A coluna `variables` é `jsonb` e o banco aceita qualquer coisa nela: linha
 * gravada por fora — console do Supabase, script, um worker futuro — pode ter
 * uma lista que não corresponde ao texto. Confiar nela exibiria variáveis que o
 * corpo não usa, e esconderia as que usa.
 *
 * Derivar na leitura, com a mesma função da escrita, torna a divergência
 * impossível de aparecer na tela.
 */
function toTemplate(row: TemplateRow): MessageTemplate {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    language: row.language,
    body: row.body,
    variables: extractVariables(row.body),
    isApproved: row.is_approved,
    providerTemplateId: row.provider_template_id,
    isActive: row.is_active,
    updatedAt: new Date(row.updated_at),
  }
}

/**
 * O payload de escrita, e o que ele deliberadamente NÃO carrega.
 *
 * `is_approved` e `provider_template_id` pertencem ao provedor: a aplicação os
 * lê e nunca os grava. Marcá-los aqui afirmaria uma aprovação que ninguém deu —
 * e o erro só apareceria no dia do primeiro envio recusado.
 */
function toPayload(data: NewMessageTemplateData) {
  return {
    name: data.name,
    category: data.category,
    body: data.body,
    language: TEMPLATE_LANGUAGE,
    // Gravado a partir do corpo, pela mesma função que a leitura usa.
    variables: extractVariables(data.body) as unknown as Json,
  }
}

export class SupabaseMessageTemplateRepository implements MessageTemplateRepository {
  constructor(private readonly client: Client) {}

  async list(clinicId: string): Promise<MessageTemplate[]> {
    const { data, error } = await this.client
      .from('message_templates')
      .select(TEMPLATE_SELECT)
      .eq('clinic_id', clinicId)
      .order('name', { ascending: true })
      .limit(TEMPLATE_CAP)

    if (error) throw toTemplateError(error)
    return (data ?? []).map((row) => toTemplate(row as unknown as TemplateRow))
  }

  async create(
    clinicId: string,
    data: NewMessageTemplateData,
  ): Promise<MessageTemplate> {
    const { data: row, error } = await this.client
      .from('message_templates')
      .insert({
        clinic_id: clinicId,
        is_active: true,
        /*
         * `is_approved: false` é o único valor honesto no nascimento: o modelo
         * acabou de ser escrito e nenhum provedor o viu. Ele é explícito porque
         * a coluna é `not null` — e não porque a aplicação decide aprovação.
         */
        is_approved: false,
        ...toPayload(data),
      })
      .select(TEMPLATE_SELECT)
      .single()

    if (error) throw toTemplateError(error)
    if (!row) throw new MessageTemplateError('unexpected', 'insert sem retorno')
    return toTemplate(row as unknown as TemplateRow)
  }

  async update(
    clinicId: string,
    templateId: string,
    data: NewMessageTemplateData,
  ): Promise<MessageTemplate> {
    return this.patch(clinicId, templateId, {
      ...toPayload(data),
      updated_at: new Date().toISOString(),
    })
  }

  async setActive(
    clinicId: string,
    templateId: string,
    isActive: boolean,
  ): Promise<MessageTemplate> {
    return this.patch(clinicId, templateId, {
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
  }

  /**
   * UPDATE que distingue "sumiu" de "a policy recusou".
   *
   * `message_templates` já existe no banco aplicado com RLS ativa, mas a
   * verificação registrada em `docs/03-banco-de-dados.md` cobriu leitura
   * anônima, não escrita autenticada. Sem policy de UPDATE, zero linhas mudam
   * sem erro.
   */
  private async patch(
    clinicId: string,
    templateId: string,
    patch: Database['public']['Tables']['message_templates']['Update'],
  ): Promise<MessageTemplate> {
    const { data, error } = await this.client
      .from('message_templates')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', templateId)
      .select(TEMPLATE_SELECT)
      .maybeSingle()

    if (error) throw toTemplateError(error)
    if (data) return toTemplate(data as unknown as TemplateRow)

    const { data: existing, error: readError } = await this.client
      .from('message_templates')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', templateId)
      .maybeSingle()

    if (readError) throw toTemplateError(readError)
    if (existing) {
      throw new MessageTemplateError(
        'write-forbidden',
        'o modelo é legível mas a escrita foi recusada',
      )
    }
    throw new MessageTemplateError('not-found', 'modelo indisponível nesta clínica')
  }
}

function toTemplateError(error: {
  code?: string | null
  message?: string | null
}): MessageTemplateError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  if (code === '42501' || code === 'PGRST301') {
    return new MessageTemplateError('forbidden', 'recusado pela policy', code)
  }
  if (code === '23505') {
    return new MessageTemplateError('duplicate', 'nome já usado', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new MessageTemplateError('unavailable', 'falha de conexão', code)
  }
  return new MessageTemplateError('unexpected', 'falha ao acessar modelos', code)
}
