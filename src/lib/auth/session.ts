import 'server-only'

import { cache } from 'react'

import { getActiveClinicId, getActiveClinicRole } from '@/lib/auth/active-clinic'
import type { ClinicStatus, MembershipRole } from '@/lib/supabase/database.types'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Camada de acesso a sessao (DAL).
 *
 * Existe para que casca, paginas e repositorios facam a mesma pergunta uma unica
 * vez por request: quem e o usuario, e ele tem clinica? Concentrar isso aqui e o
 * que impede duas telas de discordarem — e o que torna a regra
 * "sem clinica nunca ve dado ficticio" verificavel em um lugar so.
 *
 * `cache()` do React memoiza por render pass: o layout, a pagina e o repositorio
 * chamam a mesma funcao sem repetir a ida ao banco.
 */

export type SessionState =
  /** Supabase ausente do ambiente: a aplicacao roda em demonstracao local. */
  | { status: 'not-configured' }
  /** Sem sessao valida — destino /login. */
  | { status: 'anonymous' }
  /** Autenticado, mas sem vinculo de clinica — destino /onboarding. */
  | { status: 'needs-onboarding'; user: SessionUser }
  /** Há vínculo, mas as claims de clínica não chegaram ao JWT. */
  | { status: 'claims-stale'; user: SessionUser; clinicId: string }
  /** Autenticado e com clinica ativa resolvida pelo banco. */
  | {
      status: 'active'
      user: SessionUser
      clinicId: string
      clinicName: string | null
      /**
       * `clinics.status` — o estado COMERCIAL da clinica.
       *
       * Nao confundir com o `status` desta uniao, que e o estado da SESSAO. A
       * coluna existia desde o primeiro schema e nao era lida por ninguem: uma
       * clinica `suspended` no banco funcionava inteira (C-ST).
       *
       * `null` quando a leitura falhou. Nesse caso nada e bloqueado — ver
       * `readClinic`.
       */
      clinicStatus: ClinicStatus | null
      role: MembershipRole | null
    }

export interface SessionUser {
  id: string
  email: string | null
  /** Nome de exibicao: profiles.full_name, com fallback para os metadados do Auth. */
  displayName: string
  avatarUrl: string | null
}

/** Rotulos em pt-BR dos papeis do banco, para a casca nao expor o enum cru. */
export const roleLabels: Record<MembershipRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  professional: 'Profissional',
  receptionist: 'Recepção',
  finance: 'Financeiro',
}

const fallbackRoleLabel = 'Equipe'

export function describeRole(role: MembershipRole | null): string {
  return role ? roleLabels[role] : fallbackRoleLabel
}

/**
 * Nome a exibir na casca, com o rotulo da demonstracao como ultimo recurso.
 *
 * # Por que isto virou funcao
 *
 * A casca e o painel decidiam isso cada um do seu jeito, e os dois jeitos nao
 * eram equivalentes. O layout perguntava "e demonstracao?" e so entao usava o
 * nome de exemplo. O painel perguntava o contrario — "a sessao esta ATIVA?" — e
 * caia no nome de exemplo em todos os outros casos, incluindo `claims-stale` e
 * `needs-onboarding`, que sao pessoas reais, autenticadas, com nome proprio. Nas
 * duas o layout redireciona antes, entao a tela nao chegava a pintar; a protecao
 * era o desvio de outro arquivo, e nao a decisao deste.
 *
 * Chamar alguem pelo nome de outra pessoa e um erro barato de cometer e caro de
 * ver acontecendo — ainda mais quando o nome de exemplo e o de uma pessoa de
 * verdade nos dados de demonstracao.
 *
 * A pergunta certa e "ha usuario nesta sessao?". `'user' in session` responde
 * pela FORMA do estado, entao um estado novo que carregue usuario ja nasce
 * usando o nome real, sem ninguem lembrar de vir aqui.
 *
 * `demoName` entra por parametro de proposito: dado de demonstracao mora em
 * `lib/mocks`, e a camada de sessao nao pode depender dele.
 */
export function displayNameOf(session: SessionState, demoName: string): string {
  return 'user' in session ? session.user.displayName : demoName
}

/** Ultimo recurso quando nem profiles nem metadados trazem nome. */
function nameFromEmail(email: string | null): string {
  if (!email) return 'Usuário'
  const [local] = email.split('@')
  return local ? local.replace(/[._-]+/g, ' ').trim() || 'Usuário' : 'Usuário'
}

export const getSessionState = cache(async function getSessionState(): Promise<SessionState> {
  if (!isSupabaseConfigured()) return { status: 'not-configured' }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return { status: 'not-configured' }

  // getUser() valida o token no servidor de auth. getSession()/getClaims() leem o
  // cookie e servem para checagem otimista (proxy), nao para decisao de acesso.
  const { data: userData, error: userError } = await supabase.auth.getUser()
  const authUser = userData?.user

  if (userError || !authUser) return { status: 'anonymous' }

  const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>
  const metadataName =
    typeof metadata.full_name === 'string'
      ? metadata.full_name
      : typeof metadata.name === 'string'
        ? metadata.name
        : null
  const metadataAvatar =
    typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', authUser.id)
    .maybeSingle()

  const user: SessionUser = {
    id: authUser.id,
    email: authUser.email ?? null,
    displayName:
      profile?.full_name?.trim() ||
      metadataName?.trim() ||
      nameFromEmail(authUser.email ?? null),
    avatarUrl: profile?.avatar_url ?? metadataAvatar,
  }

  const clinicId = await getActiveClinicId()

  if (!clinicId) {
    // Checagem defensiva: `current_clinic_id()` le as claims do JWT, e o token
    // emitido antes de `create_clinic()` ainda nao as carrega (ver supabase/seed.sql).
    // Se ha vinculo ativo na tabela, o usuario NAO deve ser mandado ao onboarding
    // de novo — ele veria a tela de criar clinica com uma clinica ja criada.
    const { data: membership } = await supabase
      .from('memberships')
      .select('clinic_id, role')
      .eq('user_id', authUser.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (!membership) return { status: 'needs-onboarding', user }

    return { status: 'claims-stale', user, clinicId: membership.clinic_id }
  }

  const clinic = await readClinic(supabase, clinicId)

  return {
    status: 'active',
    user,
    clinicId,
    clinicName: clinic.name,
    clinicStatus: clinic.status,
    role: await getActiveClinicRole(),
  }
})

/**
 * Nome e estado da clinica, na MESMA leitura.
 *
 * O estado entrou junto do nome de proposito: os dois vem da mesma linha, e uma
 * segunda consulta so para ler uma coluna custaria uma ida de rede em toda
 * requisicao autenticada.
 *
 * Falha de leitura devolve `null` nos dois, e `null` NAO bloqueia nada — mesma
 * escolha que a cota do plano e o horario de funcionamento fazem: um Postgres
 * indisponivel nao pode virar clinica trancada.
 */
async function readClinic(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  clinicId: string,
): Promise<{ name: string | null; status: ClinicStatus | null }> {
  const { data } = await supabase
    .from('clinics')
    .select('trade_name, status')
    .eq('id', clinicId)
    .maybeSingle()

  return { name: data?.trade_name ?? null, status: data?.status ?? null }
}
