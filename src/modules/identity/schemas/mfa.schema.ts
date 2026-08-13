/**
 * Mensagens do segundo fator — feature **S-MFA**.
 *
 * Nenhuma carrega detalhe do provedor (docs/06-acoes-e-auditoria.md §2): código
 * de erro do Supabase Auth diz o que existe do outro lado, e numa tela de
 * segurança isso é mapa para quem está tentando entrar.
 */
export const mfaMessages = {
  nameRequired: 'Dê um nome ao aparelho — "Celular da Ana" ajuda a reconhecê-lo depois.',
  codeInvalid: 'O código tem seis dígitos. Confira no aplicativo autenticador.',
  /**
   * Código recusado.
   *
   * A causa mais comum não é código errado: é relógio do aparelho fora de hora,
   * porque TOTP é calculado a partir do tempo. Dizer isso poupa a pessoa de
   * tentar seis vezes o mesmo número.
   */
  codeRejected:
    'Código não confere. Ele muda a cada 30 segundos — confira também se a hora do aparelho está automática.',
  /**
   * O enrolamento foi recusado pelo provedor.
   *
   * Pode ser MFA desabilitado no projeto Supabase, e daqui **não há como
   * distinguir**. A frase não afirma qual das duas coisas é.
   */
  enrollFailed:
    'Não foi possível iniciar o cadastro do segundo fator. Se o problema continuar, confira se a verificação em duas etapas está habilitada no projeto.',
  unenrollFailed:
    'Não foi possível remover este aparelho. Verifique se a sessão atual já passou pela verificação em duas etapas.',
  /**
   * Mexer nos fatores exige ter apresentado um fator.
   *
   * A conta já tem segundo fator e esta sessão não o apresentou. É o estado de
   * quem entrou só com a senha — e é justamente quem não pode cadastrar um
   * aparelho novo nem remover o que existe.
   */
  stepUpRequired:
    'Confirme o código do aplicativo autenticador antes de alterar os aparelhos desta conta.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  /** Exibido quando a listagem falha — a tela não finge "sem fator". */
  listUnavailable:
    'Não foi possível carregar os aparelhos cadastrados. O estado abaixo pode estar incompleto.',
} as const
