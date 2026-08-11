'use server'

import { revalidatePath } from 'next/cache'

import {
  activeFactors,
  isValidTotpCode,
  normalizeTotpCode,
  pendingFactors,
  type EnrolledFactor,
} from '@/lib/security/mfa'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import { mfaMessages } from '../schemas/mfa.schema'

/**
 * Segundo fator (TOTP) — feature **S-MFA**.
 *
 * # Por que fora do `createAction`
 *
 * O pipeline padrão resolve a CLÍNICA ativa e autoriza por papel. Segundo fator
 * é da CONTA: vale em toda clínica, e quem não tem vínculo nenhum ainda precisa
 * poder proteger o próprio acesso. Passar por `createAction` exigiria clínica
 * ativa para uma operação que não tem nada a ver com ela.
 *
 * O que substitui a autorização: o Supabase resolve o fator **pelo usuário da
 * sessão**. Não há parâmetro por onde apontar para a conta de outra pessoa — o
 * `factorId` que chega do cliente só é aceito se pertencer a quem está logado, e
 * quem decide isso é o provedor, não este código.
 *
 * # Se o projeto não tiver MFA habilitado
 *
 * `enroll` devolve erro, e a mensagem diz isso — não há como verificar daqui se
 * a configuração existe no projeto Supabase, e fingir que enrolou seria pior.
 */

export interface EnrollResult {
  ok: boolean
  error?: string
  /** SVG do QR code, pronto para exibir. Nunca persistido. */
  qrCode?: string
  /** O segredo em texto, para quem digita à mão. Mostrado UMA vez. */
  secret?: string
  factorId?: string
}

export interface MfaActionResult {
  ok: boolean
  error?: string
}

/**
 * Começa o cadastro de um fator TOTP.
 *
 * Devolve QR e segredo **uma única vez**: nada disso é guardado por este código,
 * e recarregar a página perde o que não foi escaneado. É o comportamento certo —
 * um segredo TOTP que fica disponível para reexibição vale tanto quanto a senha.
 */
export async function enrollTotpAction(
  friendlyName: string,
): Promise<EnrollResult> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { ok: false, error: mfaMessages.unavailable }

  const name = friendlyName.trim().slice(0, 60)
  if (name.length < 2) return { ok: false, error: mfaMessages.nameRequired }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: name,
  })

  if (error) {
    console.error('[mfa] enroll recusado', { code: error.code ?? null })
    return { ok: false, error: mfaMessages.enrollFailed }
  }

  return {
    ok: true,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    factorId: data.id,
  }
}

/**
 * Confirma o fator com o primeiro código, e é o que o torna real.
 *
 * Sem esta etapa o fator fica `unverified`: existe na conta, não protege nada, e
 * o provedor não o exige no login. É por isso que `activeFactors` só conta
 * verificados.
 *
 * `challengeAndVerify` faz desafio e verificação numa chamada — dois passos
 * separados aqui só criariam um `challengeId` para o cliente guardar, e um
 * identificador a mais atravessando a fronteira sem necessidade.
 */
export async function verifyTotpAction(
  factorId: string,
  code: string,
): Promise<MfaActionResult> {
  if (!isValidTotpCode(code)) return { ok: false, error: mfaMessages.codeInvalid }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return { ok: false, error: mfaMessages.unavailable }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: normalizeTotpCode(code),
  })

  if (error) {
    console.error('[mfa] verificacao recusada', { code: error.code ?? null })
    return { ok: false, error: mfaMessages.codeRejected }
  }

  /*
   * A casca inteira muda: a sessao sobe para `aal2` e o painel de seguranca
   * passa a listar o fator. `layout` porque o estado vive no topo, e nao numa
   * pagina so.
   */
  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Remove um fator.
 *
 * O provedor exige sessão `aal2` para desenrolar um fator verificado — ou seja,
 * quem removeu acabou de provar que tem o aparelho. Não há guarda extra aqui
 * porque duplicá-la em pior qualidade não acrescentaria nada.
 */
export async function unenrollFactorAction(
  factorId: string,
): Promise<MfaActionResult> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { ok: false, error: mfaMessages.unavailable }

  const { error } = await supabase.auth.mfa.unenroll({ factorId })

  if (error) {
    console.error('[mfa] remocao recusada', { code: error.code ?? null })
    return { ok: false, error: mfaMessages.unenrollFailed }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Os fatores da conta, no recorte que a tela usa.
 *
 * **O segredo do TOTP nunca aparece aqui** — o provedor não o devolve em
 * listagem, e é o desenho certo: ele existe uma vez, no enrolamento, e depois só
 * o aparelho o tem.
 */
export async function listFactors(): Promise<{
  active: EnrolledFactor[]
  pending: EnrolledFactor[]
  unavailable: boolean
}> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { active: [], pending: [], unavailable: true }

  const { data, error } = await supabase.auth.mfa.listFactors()

  if (error || !data) {
    console.error('[mfa] listagem indisponivel', { code: error?.code ?? null })
    return { active: [], pending: [], unavailable: true }
  }

  const factors: EnrolledFactor[] = (data.all ?? []).map((entry) => ({
    id: entry.id,
    friendlyName: entry.friendly_name ?? null,
    status: entry.status,
  }))

  return {
    active: activeFactors(factors),
    pending: pendingFactors(factors),
    unavailable: false,
  }
}
