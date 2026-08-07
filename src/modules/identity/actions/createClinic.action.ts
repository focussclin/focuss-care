'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

import { recordAuditEvent } from '@/lib/audit/audit-log'
import { describeCause } from '@/lib/observability/describe-cause'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import {
  clinicMessages,
  createClinicSchema,
  type CreateClinicInput,
} from '../schemas/clinic.schema'

export interface CreateClinicResult {
  ok: boolean
  /** Mensagem pronta para exibicao — nunca carrega detalhe do banco. */
  error?: string
  /** Erros por campo, para a view marcar o input certo. */
  fieldErrors?: Partial<Record<keyof CreateClinicInput, string>>
  /**
   * True quando a clinica foi criada mas as claims do JWT nao puderam ser
   * renovadas. A sessao continua valida; a clinica ativa so aparece apos o
   * proximo refresh do token.
   */
  staleClaims?: boolean
}

/**
 * Codigos do Postgres que a RPC pode propagar quando o slug ja existe.
 * `23505` e unique_violation; o texto e checado como rede de seguranca porque a
 * RPC pode reempacotar o erro com `raise exception`.
 */
function isSlugConflict(code: string | undefined, message: string): boolean {
  if (code === '23505') return true
  const normalized = message.toLowerCase()
  return (
    normalized.includes('duplicate key') ||
    normalized.includes('unique constraint') ||
    normalized.includes('clinics_slug')
  )
}

function logCreateClinicError(
  context: string,
  cause: unknown,
  extra?: Record<string, unknown>,
) {
  // O log do servidor recebe o detalhe inteiro — `details` e `hint` sao o que
  // identifica a policy ou a constraint que recusou. O que volta ao usuario
  // continua sendo apenas `clinicMessages`.
  console.error('[createClinicAction]', { context, ...describeCause(cause), ...extra })
}

/**
 * Cria a clinica do usuario autenticado.
 *
 * Usa o cliente de servidor COM A SESSAO DO USUARIO — nunca a chave secreta. A
 * RPC `create_clinic` deriva o dono de `auth.uid()` e cria o vinculo `owner`,
 * entao nao ha id de usuario trafegando do cliente e nao ha como criar clinica
 * em nome de outra pessoa.
 */
export async function createClinicAction(
  input: CreateClinicInput,
): Promise<CreateClinicResult> {
  const parsed = createClinicSchema.safeParse(input)

  if (!parsed.success) {
    const fieldErrors: CreateClinicResult['fieldErrors'] = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === 'tradeName' || field === 'slug') {
        fieldErrors[field] ??= issue.message
      }
    }

    return {
      ok: false,
      error: clinicMessages.invalidFields,
      fieldErrors,
    }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { ok: false, error: clinicMessages.unexpected }
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) {
    return { ok: false, error: clinicMessages.sessionExpired }
  }

  const { data: existingMembership, error: membershipError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    logCreateClinicError('membership-check', membershipError)
    return { ok: false, error: clinicMessages.unexpected }
  }

  if (existingMembership) {
    return { ok: false, error: clinicMessages.alreadyHasClinic }
  }

  // A RPC devolve a linha criada (`Returns: ClinicRow`). Guardar o id daqui e a
  // unica forma de saber COM CERTEZA qual clinica esta acao criou: as claims
  // dizem qual esta ativa, que e outra pergunta.
  const { data: createdClinic, error } = await supabase.rpc('create_clinic', {
    p_slug: parsed.data.slug,
    p_trade_name: parsed.data.tradeName,
  })

  if (error) {
    if (isSlugConflict(error.code, error.message ?? '')) {
      return {
        ok: false,
        error: clinicMessages.slugTaken,
        fieldErrors: { slug: clinicMessages.slugTaken },
      }
    }

    // 42501 = insufficient_privilege: a RLS recusou. Vale como sessao invalida
    // para o usuario — a mensagem nao muda o que ele pode fazer a respeito.
    if (error.code === '42501' || error.code === 'PGRST301') {
      return { ok: false, error: clinicMessages.sessionExpired }
    }

    logCreateClinicError('create-clinic-rpc', error)

    return { ok: false, error: clinicMessages.unexpected }
  }

  // O JWT em uso foi emitido ANTES do vinculo existir, entao ainda nao carrega a
  // clinica nas claims (ver supabase/seed.sql). Sem este refresh,
  // `current_clinic_id()` devolveria vazio logo apos o onboarding.
  // Server Actions podem gravar cookies, entao o token novo persiste aqui.
  const { error: refreshError } = await supabase.auth.refreshSession()
  const { data: refreshedClinicId, error: claimsError } = await supabase.rpc(
    'current_clinic_id',
  )

  if (refreshError || claimsError || !refreshedClinicId) {
    // O id da clinica criada entra no log: sem ele, este caminho deixava a
    // clinica orfa de rastro — o insert em `audit_log` seria recusado por falta
    // de claims, e nao havia nem o id no log do servidor para recuperar depois.
    logCreateClinicError(
      'claims-refresh',
      refreshError ?? claimsError ?? { code: 'claims_missing' },
      { createdClinicId: createdClinic?.id ?? null },
    )
    return { ok: false, error: clinicMessages.claimsStale, staleClaims: true }
  }

  // Auditoria (CA7 do roadmap §14). Roda DEPOIS do refresh de propósito: só a
  // partir dele o JWT carrega a clínica, e é a claim que a RLS de `audit_log`
  // consulta. O cliente é passado explicitamente porque este é o que já tem o
  // token novo em memória — um cliente criado do zero dependeria de o cookie
  // reescrito já estar legível.
  //
  // Best-effort e deliberado: a clínica JÁ existe, o usuário JÁ pode seguir, e a
  // policy de INSERT de `audit_log` no projeto remoto não pôde ser verificada
  // nesta execução (ver docs/06-acoes-e-auditoria.md). Se a escrita for recusada,
  // o onboarding não quebra — o sinal fica no log do servidor.
  //
  // `trade_name` fica de fora: é texto livre digitado pelo usuário e em clínica
  // de profissional autônomo costuma conter o nome de uma pessoa física. O valor
  // canônico vive em `clinics` e é alcançável por `entity_id`.
  //
  // `entityId` sai da linha devolvida pela RPC, nao de `current_clinic_id()`:
  // a claim responde "qual clinica esta ativa", que so por coincidencia e a
  // recem-criada. O evento precisa apontar para a entidade que ESTA acao criou.
  //
  // Em `after()` pelo mesmo motivo que no `createAction`: sao quatro idas de
  // rede que o usuario nao precisa esperar para ver o dashboard.
  after(async () => {
    await recordAuditEvent(
      {
        action: 'clinic.created',
        entityType: 'clinic',
        entityId: createdClinic?.id ?? refreshedClinicId,
        after: { slug: parsed.data.slug },
      },
      { client: supabase },
    )
  })

  revalidatePath('/', 'layout')

  return { ok: true, staleClaims: false }
}
