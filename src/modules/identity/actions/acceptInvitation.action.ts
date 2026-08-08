'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/audit/audit-log'
import { describeCause } from '@/lib/observability/describe-cause'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import { invitationMessages } from '../schemas/invitation.schema'

export interface AcceptInvitationResult {
  ok: boolean
  /** Mensagem pronta para exibição — nunca carrega detalhe do banco. */
  error?: string
  /** Clínica em que o vínculo passou a existir, quando deu certo. */
  clinicId?: string
}

/**
 * Token opaco vindo da URL.
 *
 * O limite existe para que um `p_token` absurdo não vire uma ida ao banco. O
 * formato não é validado além disso, de propósito: quem conhece o formato é o
 * banco, e reimplementar a checagem aqui criaria uma segunda regra para
 * envelhecer fora de sincronia.
 */
const acceptInvitationSchema = z.object({
  token: z.string().trim().min(16).max(256),
})

/**
 * Aceita um convite e cria o vínculo — feature **I-04**.
 *
 * # Por que a action não sabe nada sobre o token
 *
 * `invitations` guarda `token_hash`, não o token. Quem compara é
 * `accept_invitation(p_token)`, dentro do banco, com o algoritmo que o próprio
 * banco escolheu. A action passa o token cru e recebe de volta o `clinic_id`.
 *
 * Isso não é preguiça — é o desenho correto. Se a aplicação conhecesse o
 * algoritmo, ela poderia gerar hashes válidos, e um convite deixaria de ser uma
 * prova de que alguém foi convidado.
 *
 * # O que acontece depois
 *
 * O vínculo novo NÃO troca a clínica ativa. Aceitar um convite é ganhar acesso,
 * não mudar de contexto — quem acabou de aceitar continua na clínica em que
 * estava, e troca pelo seletor (I-03) quando quiser. Trocar automaticamente
 * tiraria a pessoa do meio do trabalho dela.
 */
export async function acceptInvitationAction(
  token: string,
): Promise<AcceptInvitationResult> {
  const parsed = acceptInvitationSchema.safeParse({ token })

  if (!parsed.success) {
    return { ok: false, error: invitationMessages.invalidToken }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return { ok: false, error: invitationMessages.unexpected }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) {
    return { ok: false, error: invitationMessages.sessionExpired }
  }

  const { data: clinicId, error } = await supabase.rpc('accept_invitation', {
    p_token: parsed.data.token,
  })

  if (error) {
    /*
     * Token inválido, expirado, revogado, já aceito, ou endereçado a outro
     * e-mail: tudo devolve a MESMA mensagem.
     *
     * Distinguir "não existe" de "existe mas expirou" transformaria a rota em
     * um oráculo — daria para descobrir, por tentativa e erro, quais tokens
     * já foram emitidos por esta clínica.
     */
    if (error.code === '42501' || error.code === 'PGRST301') {
      return { ok: false, error: invitationMessages.sessionExpired }
    }

    console.error('[acceptInvitationAction]', {
      context: 'accept-invitation-rpc',
      ...describeCause(error),
    })

    return { ok: false, error: invitationMessages.invalidToken }
  }

  if (!clinicId) {
    return { ok: false, error: invitationMessages.invalidToken }
  }

  /*
   * As claims do JWT foram emitidas antes deste vínculo existir. O refresh
   * importa mesmo sem trocar de clínica ativa: sem ele o seletor de clínicas
   * (I-03) não mostraria a clínica recém-aceita até o próximo refresh natural
   * do token, e o usuário concluiria que o convite não funcionou.
   */
  const { error: refreshError } = await supabase.auth.refreshSession()

  if (refreshError) {
    console.error('[acceptInvitationAction]', {
      context: 'claims-refresh',
      ...describeCause(refreshError),
    })
    // O vínculo JÁ existe — isto não é falha de aceite, é sessão desatualizada.
    return { ok: true, clinicId, error: invitationMessages.claimsStale }
  }

  // A casca inteira muda: o seletor de clínicas ganha uma opção.
  revalidatePath('/', 'layout')

  after(async () => {
    await recordAuditEvent(
      {
        action: 'membership.accepted',
        entityType: 'membership',
        entityId: null,
        after: { clinicId },
      },
      { client: supabase },
    )
  })

  return { ok: true, clinicId }
}
