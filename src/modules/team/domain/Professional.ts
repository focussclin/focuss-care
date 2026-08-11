import type { CouncilType } from '@/lib/supabase/database.types'

/**
 * Profissionais — quem atende, e quem pode assinar.
 *
 * # Por que esta tabela faltava, e o que ela destrava
 *
 * `professionals` era **lida por quatro módulos e escrita por nenhum**: agenda,
 * prontuário, prescrições e assinatura. Sem cadastro pela aplicação, a única
 * forma de existir um profissional era alguém inserir a linha direto no banco —
 * e, sem ela, a agenda não tem a quem marcar e `current_professional_id()`
 * devolve nulo, que é a segunda porta de prontuário e prescrição.
 *
 * # `user_id` é opcional, e isso é o desenho
 *
 * `docs/03-banco-de-dados.md` registra: "dá para pôr alguém na agenda antes de a
 * pessoa ter conta". Um profissional sem vínculo aparece na agenda e **não
 * assina** — assinar exige `current_professional_id()`, que resolve pelo
 * usuário da sessão. A tela diz isso, em vez de deixar alguém descobrir na hora
 * de prescrever.
 *
 * # Não é `employees`, e não é `memberships`
 *
 * `memberships` é o acesso ao sistema; `employees` é registro de pessoal (RH);
 * `professionals` é quem tem agenda e conselho. A mesma pessoa pode ser as três
 * coisas, ou só uma — o dentista que atende sem login é profissional e não é
 * membro; a recepcionista é membro e funcionária, e não é profissional.
 */

export const COUNCIL_TYPES = [
  'CRM',
  'CRO',
  'CRP',
  'CREFITO',
  'CRN',
  'CRF',
  'COREN',
  'CREF',
  'CRFa',
  /*
   * O décimo valor do enum, e o último que faltava alcançar.
   *
   * Existe no banco para o conselho que não está na lista — CRMV, CRBM, CRESS e
   * o que mais uma clínica multiprofissional contratar. Sem ele, quem tem
   * conselho fora das nove siglas ficava sem conselho NENHUM no cadastro: o
   * número real ia embora junto com a sigla que não cabia.
   */
  'OUTRO',
] as const satisfies readonly CouncilType[]

/**
 * O rótulo de cada sigla na tela.
 *
 * Só `OUTRO` difere do próprio valor — as nove siglas são como o profissional as
 * escreve na carteira, e traduzi-las seria ruído. Um `Record` fechado, e não
 * `?? value`, para que uma sigla nova no enum apareça como erro de tipo em vez
 * de vazar crua para a tela.
 */
export const COUNCIL_LABELS: Record<CouncilType, string> = {
  CRM: 'CRM',
  CRO: 'CRO',
  CRP: 'CRP',
  CREFITO: 'CREFITO',
  CRN: 'CRN',
  CRF: 'CRF',
  COREN: 'COREN',
  CREF: 'CREF',
  CRFa: 'CRFa',
  OUTRO: 'Outro conselho',
}

export interface Professional {
  id: string
  /** Nulo quando ninguém do sistema está vinculado. Ver o cabeçalho. */
  userId: string | null
  displayName: string
  councilType: CouncilType | null
  councilNumber: string | null
  councilState: string | null
  specialties: readonly string[]
  agendaColor: string | null
  defaultSlotMinutes: number
  isActive: boolean
}

export interface NewProfessionalData {
  displayName: string
  councilType: CouncilType | null
  councilNumber: string | null
  councilState: string | null
  specialties: readonly string[]
  agendaColor: string | null
  defaultSlotMinutes: number
  userId: string | null
}

/**
 * Conselho é um conjunto: sigla, número e estado andam juntos.
 *
 * "CRM 12345" sem estado não identifica ninguém — o mesmo número existe em
 * cada unidade federativa. E número sem sigla não diz de que conselho é. Ou os
 * três, ou nenhum.
 */
export function councilIsComplete(
  councilType: CouncilType | null,
  councilNumber: string | null,
  councilState: string | null,
): boolean {
  const preenchidos = [councilType, councilNumber?.trim() || null, councilState?.trim() || null]
  return preenchidos.every((value) => value !== null) || preenchidos.every((value) => value === null)
}

/** 'CRM 12345/SP', ou null quando o conselho não foi informado. */
export function formatCouncil(professional: Professional): string | null {
  if (!professional.councilType || !professional.councilNumber) return null

  const estado = professional.councilState ? `/${professional.councilState}` : ''

  /*
   * `OUTRO` não é sigla de conselho nenhum — imprimi-lo cru produziria
   * "OUTRO 12345/SP", que parece erro de sistema numa ficha. "Conselho" diz o
   * que o número é sem inventar a sigla que ninguém informou.
   */
  const sigla = professional.councilType === 'OUTRO' ? 'Conselho' : professional.councilType

  return `${sigla} ${professional.councilNumber}${estado}`
}

/**
 * Quem pode assinar prontuário e prescrição.
 *
 * Exige vínculo com usuário: `current_professional_id()` resolve pelo usuário
 * da sessão, e sem `user_id` a função não encontra ninguém. Um profissional
 * inativo também não assina — ele saiu da operação.
 */
export function canSign(professional: Professional): boolean {
  return professional.isActive && professional.userId !== null
}

/**
 * Duração padrão do encaixe na agenda.
 *
 * Fora desta faixa é erro de digitação: menos de cinco minutos não é
 * atendimento agendável, e mais de quatro horas não é encaixe padrão — é
 * exceção, e exceção se marca na agenda.
 */
export const MIN_SLOT_MINUTES = 5
export const MAX_SLOT_MINUTES = 240

export function isValidSlot(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= MIN_SLOT_MINUTES &&
    minutes <= MAX_SLOT_MINUTES
  )
}

/** Ativos primeiro, e alfabética dentro de cada grupo. */
export function sortProfessionals<T extends { isActive: boolean; displayName: string }>(
  professionals: readonly T[],
): T[] {
  return [...professionals].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1
    return left.displayName.localeCompare(right.displayName, 'pt-BR')
  })
}
