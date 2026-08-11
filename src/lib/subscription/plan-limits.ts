/**
 * Limites do plano — a regra, sem I/O.
 *
 * # O que estava quebrado
 *
 * `plans` tem `max_professionals`, `max_patients` e `storage_mb`, e
 * `/assinaturas` os exibia com barra de uso e nível de alerta. **Nenhuma escrita
 * os consultava.** Cadastrar o 11º profissional num plano de 10 funcionava
 * normalmente: o limite era decorativo, e um SaaS cujo plano não limita nada não
 * tem plano — tem tabela de preços.
 *
 * # Por que em `lib/`, e não num módulo
 *
 * A cota é transversal: quem a consulta é `patients` (ao cadastrar paciente) e
 * `team` (ao cadastrar profissional), e o dado vive em `subscription`. Nenhum
 * módulo importa o interior de outro — regra verificada por `publicApi.test.ts`.
 * É a mesma posição de `lib/auth/permissions.ts`, e pela mesma razão.
 *
 * Este arquivo é **puro**: recebe números e devolve veredito. A leitura do banco
 * fica em `plan-quota.ts`, ao lado.
 */

/** O que uma cota limita. Fechado: cada valor tem coluna própria em `plans`. */
export type QuotaResource = 'professionals' | 'patients'

export interface PlanLimit {
  /** `null` significa **sem teto** — e não zero. A diferença muda a decisão. */
  max: number | null
  used: number
}

/**
 * Cabe mais um?
 *
 * `null` é sem teto: plano ilimitado, ou clínica sem assinatura. A segunda
 * merece atenção — ver `quotaFor` em `plan-quota.ts`.
 *
 * A comparação é `used >= max`, e não `>`: com 10 de 10 usados, o próximo é o
 * 11º. Errar o sinal aqui deixaria todo plano entregar um a mais.
 */
export function hasRoom(limit: PlanLimit): boolean {
  if (limit.max === null) return true
  return limit.used < limit.max
}

/**
 * Quanto ainda cabe. `null` quando não há teto.
 *
 * Nunca negativo: uma clínica pode ter estourado o limite antes desta fatia
 * existir — ou por importação —, e mostrar "-3 disponíveis" transformaria um
 * estado herdado em erro de cálculo aparente.
 */
export function remaining(limit: PlanLimit): number | null {
  if (limit.max === null) return null
  return Math.max(0, limit.max - limit.used)
}

/**
 * A mensagem que a pessoa lê quando o limite barra a operação.
 *
 * Diz o número e o caminho de saída. "Limite atingido" sozinho deixa quem opera
 * sem saber se são 10 ou 1000, e sem saber o que fazer a respeito — e quem lê
 * esta frase costuma ser recepção, que não decide plano nenhum.
 */
export function limitReachedMessage(
  resource: QuotaResource,
  max: number,
): string {
  /*
   * Formas escritas por extenso, e não sufixo concatenado.
   *
   * O plural de "profissional" é "profissionais" — `-al` vira `-ais`, não
   * `-alis`. Montar plural com `+ 's'`/`+ 'is'` produz "profissionalis", e é
   * exatamente esta frase que a pessoa lê no momento em que o sistema a impede
   * de trabalhar.
   */
  const noun =
    resource === 'professionals'
      ? max === 1
        ? '1 profissional ativo'
        : `${max} profissionais ativos`
      : max === 1
        ? '1 paciente'
        : `${max} pacientes`

  return `O plano desta clínica permite ${noun}, e o limite foi atingido. Fale com o responsável para mudar de plano — em Assinaturas.`
}
