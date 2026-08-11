import type { ContractType, TimeOffKind, TimeOffStatus } from '@/lib/supabase/database.types'

/**
 * O vínculo TRABALHISTA — feature **S-02**.
 *
 * # A terceira entidade, e por que ela faltava
 *
 * S-01 documentou três coisas distintas e entregou duas: `memberships` (acesso
 * ao sistema) e `professionals` (quem atende). `employees` é a terceira — o
 * vínculo de trabalho — e ficou de fora porque nada dependia dela. Ausências
 * dependem: `time_off.employee_id` é NOT NULL, e não há como registrar a férias
 * de alguém que o sistema não sabe que trabalha ali.
 *
 * # O que este cadastro NÃO guarda, e é decisão, não esquecimento
 *
 * `employees` tem `salary_cents` e `cpf`, e **nenhum dos dois é escrito aqui**.
 * Salário é o dado pessoal mais sensível de uma folha, e o produto não tem
 * folha: guardá-lo agora seria acumular risco de LGPD por uma funcionalidade
 * que ninguém pediu. CPF de funcionário serve a obrigação trabalhista, que é o
 * mesmo caso. Quando houver folha, os dois entram com a tela que os usa.
 */
export interface Employee {
  id: string
  fullName: string
  /** Cargo, em texto livre: "Recepcionista", "Auxiliar de enfermagem". */
  roleTitle: string | null
  contractType: ContractType
  /**
   * Está na equipe hoje?
   *
   * **Derivado do desligamento**, e não um interruptor à parte — ver
   * `isEmployed`. Enquanto eram duas coisas, existia o estado impossível
   * "ativo, desligado em 12/03".
   */
  isActive: boolean
  /** Início do vínculo. Null nos cadastros feitos antes de o campo existir. */
  hireDate: Date | null
  /** Fim do vínculo. Null enquanto a pessoa trabalha ali. */
  terminationDate: Date | null
  /** Quando este funcionário também atende — liga a `professionals`. */
  professionalId: string | null
}

export interface NewEmployeeData {
  fullName: string
  roleTitle: string | null
  contractType: ContractType
  professionalId: string | null
  /** Data de admissão, quando informada. */
  hireDate: Date | null
}

/**
 * Está empregado?
 *
 * A resposta é a AUSÊNCIA de data de desligamento, e não uma coluna própria.
 * `employees.is_active` existe no schema e continua sendo escrita — mas quem
 * decide é a data, porque só ela responde "desde quando" quando alguém
 * perguntar.
 *
 * A regra vale também na LEITURA: uma linha com data de desligamento e
 * `is_active = true` foi escrita fora do produto, e o desligamento vence.
 * Mostrar "Ativo" sobre alguém com data de saída registrada seria a tela
 * contradizendo o próprio banco.
 */
export function isEmployed(terminationDate: Date | null): boolean {
  return terminationDate === null
}

/**
 * O desligamento pode ser registrado nesta data?
 *
 * Duas recusas, e as duas são sobre o que o produto consegue sustentar:
 *
 *  - **Antes da admissão** é período negativo. Não é engano de digitação
 *    inofensivo: `time_off` pendura ausências neste vínculo, e um intervalo
 *    invertido faria qualquer contagem de dias trabalhados dar negativo.
 *  - **No futuro** parece razoável — aviso prévio é rotina —, e é justamente o
 *    que este produto não pode prometer. Não há worker nem cron para virar o
 *    vínculo no dia marcado, então aceitar uma data futura tiraria a pessoa da
 *    equipe **hoje**, enquanto ela ainda trabalha. Quando houver executor, a
 *    regra muda com ele.
 */
export type TerminationRefusal = 'before-hire' | 'in-future'

export function refuseTermination(
  hireDate: Date | null,
  terminationDate: Date,
  today: Date,
): TerminationRefusal | null {
  if (terminationDate.getTime() > today.getTime()) return 'in-future'
  if (hireDate && terminationDate.getTime() < hireDate.getTime()) {
    return 'before-hire'
  }

  return null
}

/**
 * A admissao pode ser corrigida sem criar um segundo vinculo.
 * A data pode ser removida para preservar cadastros antigos sem esse campo.
 */
export type HireDateRefusal = 'after-termination'

export function refuseHireDate(
  hireDate: Date | null,
  terminationDate: Date | null,
): HireDateRefusal | null {
  if (hireDate && terminationDate && hireDate.getTime() > terminationDate.getTime()) {
    return 'after-termination'
  }

  return null
}

/**
 * Uma ausência: férias, atestado, folga.
 *
 * Nasce em `requested` e recebe resposta — o mesmo desenho da guia de convênio
 * (V-01), e pela mesma razão: quem pede e quem aprova são pessoas diferentes, e
 * a decisão precisa ficar registrada com autor e data.
 */
export interface TimeOff {
  id: string
  employeeId: string
  employeeName: string
  kind: TimeOffKind
  status: TimeOffStatus
  startsOn: Date
  endsOn: Date
  /** Texto de quem pediu. Pode conter motivo de saúde — ver o repositório. */
  reason: string | null
  answeredAt: Date | null
}

export interface NewTimeOffData {
  employeeId: string
  kind: TimeOffKind
  startsOn: Date
  endsOn: Date
  reason: string | null
}
