import type { ClinicStatus } from '@/lib/supabase/database.types'

/**
 * O estado da clínica governa o acesso — feature **C-ST**.
 *
 * # O que estava quebrado
 *
 * `clinics.status` existe desde o primeiro schema com cinco valores, e **nenhuma
 * linha do produto o lia**. Uma clínica marcada `suspended` ou `canceled` no
 * banco continuava funcionando inteira: cancelar uma assinatura não tinha efeito
 * nenhum sobre o acesso.
 *
 * Para um SaaS isso é o interruptor faltando. Não é uma tela — é a diferença
 * entre cobrar e não cobrar.
 *
 * # A escala é deliberada, e o meio é o que importa
 *
 * `past_due` **não corta nada**. Boleto atrasado não pode impedir a recepção de
 * registrar quem acabou de chegar, nem o profissional de fechar o prontuário de
 * quem está na sala. Cortar aí transformaria uma pendência financeira em risco
 * assistencial, e a clínica trocaria de fornecedor com razão.
 *
 * `suspended` corta a ESCRITA e mantém a leitura: a clínica continua alcançando
 * o próprio histórico — prontuário tem prazo legal de guarda, e trancá-lo seria
 * reter dado de terceiro como garantia de pagamento.
 *
 * `canceled` mantém a mesma leitura, pela mesma razão. A diferença com
 * `suspended` é de intenção, não de permissão: uma volta com o pagamento, a
 * outra encerrou. Ambas param de aceitar dado novo.
 */

/** A clínica aceita dado NOVO? */
export function canWrite(status: ClinicStatus): boolean {
  return status === 'trial' || status === 'active' || status === 'past_due'
}

/**
 * A clínica alcança os próprios dados?
 *
 * Sempre. Nenhum estado tranca a leitura, e isso não é descuido: o prontuário
 * tem prazo legal de guarda, e reter o histórico de pacientes como garantia de
 * pagamento seria usar dado de terceiro como alavanca de cobrança.
 */
export function canRead(status: ClinicStatus): boolean {
  void status
  return true
}

/** Vale a pena avisar quem está usando? */
export function needsAttention(status: ClinicStatus): boolean {
  return status !== 'trial' && status !== 'active'
}

/**
 * O aviso exibido na casca, por estado.
 *
 * `null` quando não há o que dizer — banner permanente vira ruído e deixa de ser
 * lido justamente quando passa a importar.
 *
 * Cada frase diz o efeito PRÁTICO antes do rótulo: quem lê precisa saber se
 * ainda consegue trabalhar, não o nome do estado no banco.
 */
export function clinicStatusNotice(status: ClinicStatus): string | null {
  switch (status) {
    case 'trial':
    case 'active':
      return null
    case 'past_due':
      return 'O pagamento desta clínica está em atraso. Tudo continua funcionando; regularize em Assinaturas para não perder o acesso.'
    case 'suspended':
      return 'Esta clínica está suspensa: os dados continuam visíveis, mas nada novo pode ser salvo. Regularize em Assinaturas para voltar a registrar.'
    case 'canceled':
      return 'A assinatura desta clínica foi encerrada. O histórico continua acessível para consulta, e nada novo pode ser salvo.'
  }
}

/** Rótulo curto, para o selo ao lado do nome da clínica. */
export const clinicStatusLabels: Record<ClinicStatus, string> = {
  trial: 'Em teste',
  active: 'Ativa',
  past_due: 'Pagamento em atraso',
  suspended: 'Suspensa',
  canceled: 'Encerrada',
}

/**
 * A recusa que a Server Action devolve quando a escrita está bloqueada.
 *
 * Diz o caminho de saída. Quem opera o sistema quase nunca é quem paga a
 * assinatura, e "sem permissão" mandaria a recepção procurar o erro no próprio
 * acesso.
 */
export function writeBlockedMessage(status: ClinicStatus): string {
  return status === 'canceled'
    ? 'A assinatura desta clínica foi encerrada e não é possível salvar. Fale com o responsável — em Assinaturas.'
    : 'Esta clínica está suspensa e não é possível salvar. Fale com o responsável — em Assinaturas.'
}
