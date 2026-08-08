'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'

import { recordAuditEvent } from '@/lib/audit/audit-log'
import { describeCause } from '@/lib/observability/describe-cause'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import { switchClinicMessages } from '../schemas/clinic.schema'

export interface SwitchClinicResult {
  ok: boolean
  /** Mensagem pronta para exibição — nunca carrega detalhe do banco. */
  error?: string
}

const switchClinicSchema = z.object({
  clinicId: z.uuid(switchClinicMessages.unexpected),
})

/**
 * Troca a clínica ativa da sessão — feature **I-03**.
 *
 * # O `clinicId` vem do cliente, e aqui isso é correto
 *
 * O P3 de `01-arquitetura.md` proíbe `clinicId` vindo do cliente, e esta action
 * parece violá-lo. Não viola, pela mesma razão que `patientId` pode vir do
 * formulário de edição: o parâmetro diz **para onde ir**, não **de onde ler**.
 * Toda leitura seguinte continua saindo de `current_clinic_id()`.
 *
 * O que torna isso seguro não é a intenção — é a checagem. Antes da RPC, a
 * action confirma que existe vínculo **ativo** entre este usuário e esta
 * clínica. Um id de clínica alheia não acha vínculo e para aqui.
 *
 * A checagem é redundante com a RPC (que também valida) e com a RLS — e a
 * redundância é o ponto: o corpo de `switch_clinic` não é legível a partir do
 * repositório (bloqueio B1), então confiar apenas nela seria confiar no que não
 * se pode ler.
 */
export async function switchClinicAction(
  clinicId: string,
): Promise<SwitchClinicResult> {
  const parsed = switchClinicSchema.safeParse({ clinicId })

  if (!parsed.success) {
    return { ok: false, error: switchClinicMessages.unexpected }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return { ok: false, error: switchClinicMessages.unexpected }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) {
    return { ok: false, error: switchClinicMessages.sessionExpired }
  }

  const { data: membership, error: membershipError } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', userData.user.id)
    .eq('clinic_id', parsed.data.clinicId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    console.error('[switchClinicAction]', {
      context: 'membership-check',
      ...describeCause(membershipError),
    })
    return { ok: false, error: switchClinicMessages.unexpected }
  }

  /*
   * Sem vínculo e clínica inexistente devolvem a MESMA coisa, de propósito:
   * distinguir "não existe" de "existe, mas não é sua" entregaria ao cliente um
   * oráculo de existência de clínica por tentativa e erro.
   */
  if (!membership) {
    return { ok: false, error: switchClinicMessages.clinicUnavailable }
  }

  const { error: switchError } = await supabase.rpc('switch_clinic', {
    p_clinic_id: parsed.data.clinicId,
  })

  if (switchError) {
    if (switchError.code === '42501' || switchError.code === 'PGRST301') {
      return { ok: false, error: switchClinicMessages.sessionExpired }
    }

    console.error('[switchClinicAction]', {
      context: 'switch-clinic-rpc',
      ...describeCause(switchError),
    })
    return { ok: false, error: switchClinicMessages.unexpected }
  }

  /*
   * O JWT em mãos ainda aponta para a clínica ANTERIOR. Sem este refresh, a
   * próxima tela leria a clínica velha e o usuário veria a troca "não pegar" —
   * o mesmo problema que o onboarding resolve depois de `create_clinic`.
   *
   * Server Action pode gravar cookie, então o token novo persiste aqui.
   */
  const { error: refreshError } = await supabase.auth.refreshSession()

  if (refreshError) {
    console.error('[switchClinicAction]', {
      context: 'claims-refresh',
      ...describeCause(refreshError),
    })
    return { ok: false, error: switchClinicMessages.claimsStale }
  }

  /*
   * Trocar de clínica muda TODA leitura da aplicação — não há tela que sobreviva
   * à troca. Por isso a revalidação é do layout inteiro, e não de um caminho.
   */
  revalidatePath('/', 'layout')

  // Best-effort, como todo evento de auditoria hoje: a policy de INSERT de
  // `audit_log` recusa o membro autenticado (P-P6). Trocar de tenant é evento de
  // segurança — quando a policy for corrigida, este já estará gravando.
  after(async () => {
    await recordAuditEvent(
      {
        action: 'clinic.switched',
        entityType: 'clinic',
        entityId: parsed.data.clinicId,
      },
      { client: supabase },
    )
  })

  return { ok: true }
}
