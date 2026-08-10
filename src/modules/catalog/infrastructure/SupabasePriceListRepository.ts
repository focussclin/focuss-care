import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { NewPriceListData, PriceList, PriceListItem } from '../domain/PriceList'
import { sortItems } from '../domain/PriceList'
import { PriceListError, type PriceListRepository } from '../domain/PriceListRepository'

type Client = SupabaseClient<Database>

/**
 * `professional_share_percent` e `professional_share_cents` ficam FORA do
 * select, e não só das escritas.
 *
 * Lê-las colocaria no DTO um repasse cuja unidade ninguém confirmou, e número
 * no DTO acaba na tela. Enquanto a convenção não for provada, as duas colunas
 * não existem para esta aplicação.
 */
const LIST_SELECT = `
  id,
  clinic_id,
  name,
  is_default,
  valid_from,
  valid_until,
  is_active,
  price_list_items (
    id,
    service_id,
    price_cents,
    services ( id, name, code )
  )
`

const LIST_CAP = 50

interface ItemRow {
  id: string
  service_id: string
  price_cents: number
  services: { id: string; name: string; code: string | null } | null
}

interface ListRow {
  id: string
  name: string
  is_default: boolean
  valid_from: string | null
  valid_until: string | null
  is_active: boolean
  price_list_items: ItemRow[] | null
}

function toItem(row: ItemRow): PriceListItem {
  return {
    id: row.id,
    serviceId: row.service_id,
    /*
     * Serviço apagado logicamente ainda aparece: o item continua existindo, e
     * esconder o nome deixaria um preço órfão que ninguém consegue interpretar.
     */
    serviceName: row.services?.name ?? 'Serviço removido do catálogo',
    serviceCode: row.services?.code ?? null,
    priceCents: row.price_cents,
  }
}

function toList(row: ListRow): PriceList {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    validFrom: row.valid_from ? new Date(`${row.valid_from}T00:00:00`) : null,
    validUntil: row.valid_until ? new Date(`${row.valid_until}T00:00:00`) : null,
    isActive: row.is_active,
    items: sortItems((row.price_list_items ?? []).map(toItem)),
  }
}

export class SupabasePriceListRepository implements PriceListRepository {
  constructor(private readonly client: Client) {}

  async list(clinicId: string): Promise<PriceList[]> {
    const { data, error } = await this.client
      .from('price_lists')
      .select(LIST_SELECT)
      .eq('clinic_id', clinicId)
      .order('name', { ascending: true })
      .limit(LIST_CAP)

    if (error) throw toPriceListError(error)
    return (data ?? []).map((row) => toList(row as unknown as ListRow))
  }

  async create(clinicId: string, data: NewPriceListData): Promise<PriceList> {
    const { data: row, error } = await this.client
      .from('price_lists')
      .insert({
        clinic_id: clinicId,
        name: data.name,
        valid_from: toDateOnly(data.validFrom),
        valid_until: toDateOnly(data.validUntil),
        is_active: true,
        /*
         * Nasce SEM ser padrão, mesmo que seja a primeira.
         *
         * Promover automaticamente faria a primeira tabela criada virar a
         * referência de preço da clínica sem ninguém decidir isso. Promover é
         * um ato explícito.
         */
        is_default: false,
      })
      .select('id')
      .single()

    if (error) throw toPriceListError(error)
    if (!row) throw new PriceListError('unexpected', 'insert sem retorno')
    return this.requireList(clinicId, (row as { id: string }).id)
  }

  async update(
    clinicId: string,
    listId: string,
    data: NewPriceListData,
  ): Promise<PriceList> {
    await this.patch(clinicId, listId, {
      name: data.name,
      valid_from: toDateOnly(data.validFrom),
      valid_until: toDateOnly(data.validUntil),
      updated_at: new Date().toISOString(),
    })
    return this.requireList(clinicId, listId)
  }

  async setActive(
    clinicId: string,
    listId: string,
    isActive: boolean,
  ): Promise<PriceList> {
    await this.patch(clinicId, listId, {
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    return this.requireList(clinicId, listId)
  }

  /**
   * Promove a tabela a padrão — e tira o padrão das outras ANTES.
   *
   * Não há função no banco para as duas escritas juntas, e esta fatia não cria
   * migration. A ordem é deliberada: limpar primeiro e promover depois. Se a
   * segunda escrita falhar, a clínica fica **sem** padrão — estado visível na
   * tela, que pede uma escolha. A ordem inversa deixaria DUAS tabelas padrão, e
   * aí ninguém sabe qual preço vale.
   */
  async setDefault(clinicId: string, listId: string): Promise<PriceList> {
    const { error: clearError } = await this.client
      .from('price_lists')
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('is_default', true)

    if (clearError) throw toPriceListError(clearError)

    await this.patch(clinicId, listId, {
      is_default: true,
      updated_at: new Date().toISOString(),
    })
    return this.requireList(clinicId, listId)
  }

  /**
   * Grava o preço de um serviço nesta tabela.
   *
   * Atualiza o item existente quando há um, e cria quando não — o serviço não
   * pode aparecer duas vezes na mesma tabela, senão quem fatura não sabe qual
   * valor cobrar.
   */
  async setItemPrice(
    clinicId: string,
    listId: string,
    serviceId: string,
    priceCents: number,
  ): Promise<PriceList> {
    const { data: existing, error: readError } = await this.client
      .from('price_list_items')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('price_list_id', listId)
      .eq('service_id', serviceId)
      .maybeSingle()

    if (readError) throw toPriceListError(readError)

    if (existing) {
      const { error } = await this.client
        .from('price_list_items')
        .update({ price_cents: priceCents, updated_at: new Date().toISOString() })
        .eq('clinic_id', clinicId)
        .eq('id', (existing as { id: string }).id)

      if (error) throw toPriceListError(error)
    } else {
      const { error } = await this.client.from('price_list_items').insert({
        clinic_id: clinicId,
        price_list_id: listId,
        service_id: serviceId,
        price_cents: priceCents,
      })

      if (error) throw toPriceListError(error)
    }

    return this.requireList(clinicId, listId)
  }

  async removeItem(
    clinicId: string,
    listId: string,
    itemId: string,
  ): Promise<PriceList> {
    /*
     * Remoção de verdade: um item de tabela de preço é configuração, não
     * histórico. O que foi cobrado vive em `invoice_items`, com o valor
     * copiado no momento da cobrança.
     */
    const { error } = await this.client
      .from('price_list_items')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('price_list_id', listId)
      .eq('id', itemId)

    if (error) throw toPriceListError(error)
    return this.requireList(clinicId, listId)
  }

  /**
   * UPDATE que distingue "sumiu" de "a policy recusou".
   *
   * `price_lists` já existe no banco aplicado com RLS ativa, mas a verificação
   * registrada em `docs/03-banco-de-dados.md` cobriu leitura anônima, não
   * escrita autenticada. Sem policy de UPDATE, zero linhas mudam sem erro.
   */
  private async patch(
    clinicId: string,
    listId: string,
    patch: Database['public']['Tables']['price_lists']['Update'],
  ): Promise<void> {
    const { data, error } = await this.client
      .from('price_lists')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', listId)
      .select('id')
      .maybeSingle()

    if (error) throw toPriceListError(error)
    if (data) return

    const { data: existing, error: readError } = await this.client
      .from('price_lists')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', listId)
      .maybeSingle()

    if (readError) throw toPriceListError(readError)
    if (existing) {
      throw new PriceListError(
        'write-forbidden',
        'a tabela é legível mas a escrita foi recusada',
      )
    }
    throw new PriceListError('not-found', 'tabela indisponível nesta clínica')
  }

  private async requireList(clinicId: string, listId: string): Promise<PriceList> {
    const { data, error } = await this.client
      .from('price_lists')
      .select(LIST_SELECT)
      .eq('clinic_id', clinicId)
      .eq('id', listId)
      .maybeSingle()

    if (error) throw toPriceListError(error)
    if (!data) throw new PriceListError('not-found', 'tabela indisponível nesta clínica')
    return toList(data as unknown as ListRow)
  }
}

/** `Date` -> 'YYYY-MM-DD'. As colunas de validade são `date`, sem hora. */
function toDateOnly(value: Date | null): string | null {
  if (value === null) return null
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toPriceListError(error: {
  code?: string | null
  message?: string | null
}): PriceListError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  if (code === '42501' || code === 'PGRST301') {
    return new PriceListError('forbidden', 'recusado pela policy', code)
  }
  /*
   * Índice único por (tabela, serviço), se existir, bate aqui. A aplicação já
   * evita o segundo item lendo antes, mas a leitura tem janela de corrida —
   * esta não tem.
   */
  if (code === '23505') {
    return new PriceListError('duplicate', 'serviço já precificado nesta tabela', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new PriceListError('unavailable', 'falha de conexão', code)
  }
  return new PriceListError('unexpected', 'falha ao acessar tabelas de preço', code)
}
