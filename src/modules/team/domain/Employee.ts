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
  isActive: boolean
  /** Quando este funcionário também atende — liga a `professionals`. */
  professionalId: string | null
}

export interface NewEmployeeData {
  fullName: string
  roleTitle: string | null
  contractType: ContractType
  professionalId: string | null
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
