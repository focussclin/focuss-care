import { z } from 'zod'

import type { WhatsappConnectionState } from '../domain/WhatsappConnection'

export const whatsappConnectionMessages = {
  notConfigured:
    'Cadastre a URL, a chave e o nome da instância da Evolution API em Configurações → Integrações antes de conectar.',
  unauthorized:
    'O provedor recusou a chave cadastrada. Confira a API key em Configurações → Integrações.',
  unavailable:
    'Não foi possível falar com o provedor de WhatsApp agora. Tente novamente.',
  unexpected: 'Não foi possível conectar o WhatsApp agora. Tente novamente.',
  forbidden: 'Você não tem permissão para conectar o WhatsApp da clínica.',
} as const

/**
 * As três actions não recebem nada do cliente.
 *
 * Clínica sai de `current_clinic_id()` e o nome da instância sai do cofre. Um
 * `instanceName` vindo do formulário deixaria alguém apontar a tela para a
 * instância de outra clínica — e o QR devolvido parearia o WhatsApp errado.
 */
export const whatsappConnectionSchema = z.object({})

export type WhatsappConnectionInput = z.infer<typeof whatsappConnectionSchema>

export interface WhatsappConnectionDto {
  state: WhatsappConnectionState
  /**
   * Data URI do QR, quando há um a mostrar.
   *
   * Atravessa a fronteira porque é exatamente o que a tela precisa desenhar, e
   * não é persistido em lugar nenhum — nem no banco, nem na trilha de auditoria.
   */
  qrCode: string | null
  phoneNumber: string | null
}
