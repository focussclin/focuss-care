'use server'

import { revalidatePath } from 'next/cache'

import {
  activeFactors,
  isValidTotpCode,
  normalizeTotpCode,
  pendingFactors,
  requiresSecondFactor,
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
 * Esta sessão pode MEXER nos fatores da conta?
 *
 * # A escalada que isto fecha
 *
 * Quem tem a senha entra em `aal1`. O desvio de `app/(app)/layout.tsx` o barra
 * na navegação, mas Server Action é endpoint POST próprio: `enroll` seguido de
 * `verify` era alcançável por chamada direta. Cadastrar um aparelho **novo** e
 * confirmá-lo com o código do próprio atacante levaria a sessão a `aal2` sem
 * nunca tocar o fator da vítima — a senha roubada compraria o acesso inteiro, e
 * o segundo fator não teria servido para nada.
 *
 * O provedor provavelmente já recusa parte disso, e a documentação do
 * `unenroll` afirma que sim. Esta guarda não depende dessa afirmação: ela é
 * barata, e "o outro lado cuida" é a premissa que transforma uma mudança de
 * versão do provedor em brecha silenciosa.
 *
 * # Por que `requiresSecondFactor` responde sozinho
 *
 * `nextLevel === 'aal2'` só acontece quando há fator VERIFICADO na conta, e
 * `currentLevel === 'aal1'` quando esta sessão não o apresentou. O primeiro
 * cadastro da vida — nenhum fator verificado — devolve `nextLevel: 'aal1'` e
 * passa direto, que é o comportamento necessário: exigir código de quem ainda
 * não tem aparelho trancaria todo mundo para fora do recurso.
 */
async function blockedFromChangingFactors(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
): Promise<boolean> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    return requiresSecondFactor(data ?? { currentLevel: null, nextLevel: null })
  } catch (cause) {
    /*
     * Falha de leitura NÃO bloqueia — mesma política do resto do produto: nível
     * indisponível não pode trancar a pessoa para fora da própria conta. O que
     * protege o caso perigoso continua sendo o provedor.
     */
    console.error('[mfa] nivel de garantia indisponivel', {
      kind: cause instanceof Error ? cause.name : typeof cause,
    })
    return false
  }
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

  if (await blockedFromChangingFactors(supabase)) {
    return { ok: false, error: mfaMessages.stepUpRequired }
  }

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

  /*
   * A guarda NÃO vai em `verifyTotpAction`, e a diferença é o ponto.
   *
   * Verificar é o que a tela `/verificacao` faz, e ali a sessão está
   * legitimamente em `aal1` — é o estado que ela existe para resolver. Bloquear
   * lá trancaria todo mundo para fora. O que fecha a escalada é o `enroll`: sem
   * fator novo, não há o que confirmar, e confirmar o fator da vítima exige o
   * aparelho dela.
   *
   * Remover, por outro lado, é a jogada direta de quem só tem a senha.
   */
  if (await blockedFromChangingFactors(supabase)) {
    return { ok: false, error: mfaMessages.stepUpRequired }
  }

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
