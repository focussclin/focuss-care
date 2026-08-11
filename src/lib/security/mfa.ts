/**
 * Segundo fator (TOTP) — a regra, sem cliente e sem rede.
 *
 * # O que estava faltando
 *
 * O produto guarda prontuário, prescrição e dado financeiro, e a única barreira
 * era senha. Com o controle de taxa (§8.50) a força bruta ficou cara; senha
 * vazada em outro serviço continuava valendo integralmente.
 *
 * # Por que TOTP, e não SMS
 *
 * TOTP é o que o Supabase Auth oferece sem provedor externo: o segredo nasce no
 * banco de autenticação e o código é calculado no aparelho. SMS exigiria gateway,
 * crédito e contrato — e é o fator mais fraco dos três, porque a portabilidade de
 * número é um ataque conhecido.
 *
 * # AAL: o vocabulário que decide tudo
 *
 * O Supabase classifica a sessão em `aal1` (senha) e `aal2` (senha + segundo
 * fator). Duas perguntas, e confundi-las é o erro clássico:
 *
 *  - `currentLevel` — o que a sessão JÁ tem.
 *  - `nextLevel` — o que ela PODE ter, dado o que a conta tem cadastrado.
 *
 * `nextLevel === 'aal2'` com `currentLevel === 'aal1'` significa exatamente uma
 * coisa: **há fator cadastrado e ele ainda não foi apresentado.** É o único
 * estado em que a verificação deve ser exigida — e tratá-lo como "tem 2FA" sem
 * comparar com o atual mandaria para a tela de código quem já passou por ela.
 */

export type AssuranceLevel = 'aal1' | 'aal2' | (string & {})

export interface AssuranceState {
  currentLevel: AssuranceLevel | null
  nextLevel: AssuranceLevel | null
}

/**
 * A sessão precisa apresentar o segundo fator agora?
 *
 * Só quando há fator cadastrado (`nextLevel` chegou a `aal2`) e a sessão ainda
 * não o apresentou. Níveis nulos — leitura falhou, ou provedor sem MFA — **não**
 * exigem nada: exigir código sem conseguir dizer qual fator trancaria a pessoa
 * para fora por causa de uma consulta indisponível.
 */
export function requiresSecondFactor(state: AssuranceState): boolean {
  if (!state.currentLevel || !state.nextLevel) return false
  return state.nextLevel === 'aal2' && state.currentLevel === 'aal1'
}

/** A sessão já está no nível mais alto que a conta permite? */
export function isFullyVerified(state: AssuranceState): boolean {
  if (!state.currentLevel || !state.nextLevel) return true
  return state.currentLevel === state.nextLevel
}

/**
 * Um fator cadastrado, no recorte que a tela usa.
 *
 * `friendlyName` é como a pessoa reconhece o aparelho. O `id` é necessário para
 * remover, e não é segredo: sem o código do momento ele não faz nada.
 */
export interface EnrolledFactor {
  id: string
  friendlyName: string | null
  /** `verified` é o único que conta como proteção. Ver `activeFactors`. */
  status: 'verified' | 'unverified' | (string & {})
}

/**
 * Os fatores que realmente protegem a conta.
 *
 * Um `unverified` é enrolamento abandonado no meio — a pessoa gerou o QR e não
 * confirmou o código. Contá-lo como proteção diria "sua conta tem 2FA" sobre um
 * fator que ninguém consegue usar, e é o pior desfecho possível numa tela de
 * segurança.
 */
export function activeFactors(
  factors: readonly EnrolledFactor[],
): EnrolledFactor[] {
  return factors.filter((factor) => factor.status === 'verified')
}

export function hasSecondFactor(factors: readonly EnrolledFactor[]): boolean {
  return activeFactors(factors).length > 0
}

/**
 * Enrolamentos incompletos, que a tela oferece para limpar.
 *
 * Eles se acumulam: cada tentativa abandonada deixa um fator para trás, e o
 * provedor recusa um nome repetido. Sem uma forma de removê-los, a pessoa que
 * errou o código uma vez fica sem conseguir tentar de novo com o mesmo nome.
 */
export function pendingFactors(
  factors: readonly EnrolledFactor[],
): EnrolledFactor[] {
  return factors.filter((factor) => factor.status !== 'verified')
}

/**
 * O código do aplicativo autenticador.
 *
 * Seis dígitos, e a normalização importa: aplicativos e gerenciadores de senha
 * copiam com espaço no meio ("123 456"), e recusar isso seria culpar a pessoa
 * por um formato que ela não escolheu.
 */
export function normalizeTotpCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6)
}

export function isValidTotpCode(raw: string): boolean {
  return /^\d{6}$/.test(normalizeTotpCode(raw))
}
