/**
 * Mensagens do convite (I-04).
 *
 * Nenhuma delas descreve o estado do token. Ver `acceptInvitation.action.ts`:
 * separar "não existe" de "expirou" de "já foi aceito" transformaria a rota em
 * um oráculo de tokens emitidos.
 */
export const invitationMessages = {
  /**
   * Serve para token inexistente, expirado, revogado, já aceito e endereçado a
   * outro e-mail. A indistinção é a garantia, não uma simplificação.
   */
  invalidToken:
    'Este convite não é válido. Ele pode ter expirado ou já ter sido usado. Peça um novo para quem administra a clínica.',
  sessionExpired: 'Entre na sua conta para aceitar o convite.',
  claimsStale:
    'Você entrou na clínica, mas sua sessão precisa ser renovada para vê-la. Entre novamente.',
  unexpected: 'Não foi possível aceitar o convite agora. Tente novamente.',
  accepted: 'Pronto! Você agora faz parte desta clínica.',
} as const
