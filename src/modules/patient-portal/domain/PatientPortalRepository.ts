import type {
  CreatedPortalInvite,
  PortalAppointment,
  PortalInvitePreview,
  PortalInviteSummary,
  PortalInvoice,
  PortalProfile,
} from './PatientPortal'

/**
 * PORTA do portal do paciente.
 *
 * # Duas audiências, um módulo
 *
 * Os quatro primeiros métodos rodam com a sessão do **paciente**, que não é
 * membro da clínica: `current_clinic_id()` devolve null para ele, e por isso
 * nenhum deles recebe `clinicId`. O recorte vem de `portal_patient_ids()`, do
 * lado do banco, a partir de `auth.uid()`.
 *
 * Os três últimos rodam com a sessão da **equipe**, e aí `clinicId` volta a ser
 * o de sempre.
 *
 * Não separei em duas portas porque as duas metades falam das mesmas duas
 * tabelas, e a fronteira que importa — quem é o chamador — já está no banco,
 * onde ela não pode ser contornada por engano de composição.
 */
export interface PatientPortalRepository {
  // --- Sessão do PACIENTE -----------------------------------------------------

  /**
   * Perfil dos pacientes vinculados a esta conta.
   *
   * Lista, e não um só: a mesma conta pode acompanhar mais de um paciente (mãe
   * que cuida de dois filhos). Vazia quando a conta não tem vínculo — o que não
   * é erro, é a resposta certa para quem ainda não aceitou convite.
   */
  myProfiles(): Promise<PortalProfile[]>

  /** Consultas dos pacientes vinculados, no intervalo [from, to). */
  myAppointments(from: Date, to: Date): Promise<PortalAppointment[]>

  /** Cobranças em aberto e quitadas. Canceladas não voltam — ver a migration. */
  myInvoices(): Promise<PortalInvoice[]>

  /**
   * Estado de um convite, para a tela que ainda não tem sessão.
   *
   * Devolve `status: 'not-found'` em vez de lançar quando o token não existe:
   * token inválido não é falha do sistema, é a resposta.
   */
  previewInvite(token: string): Promise<PortalInvitePreview>

  /**
   * Aceita o convite e devolve o id da conta criada.
   *
   * Só funciona se o e-mail da sessão autenticada for o do convite. Falha
   * esperada (expirado, revogado, já usado, e-mail diferente) sai como
   * `PatientPortalRepositoryError` com a razão correspondente.
   */
  acceptInvite(token: string): Promise<string>

  // --- Sessão da EQUIPE -------------------------------------------------------

  /**
   * Cria o convite e devolve o token EM CLARO.
   *
   * Única vez em que ele existe fora do hash. Quem não copiar agora precisa de
   * um convite novo — e isso é a garantia, não o inconveniente.
   */
  createInvite(
    patientId: string,
    email: string,
    expiresInDays: number,
  ): Promise<CreatedPortalInvite>

  revokeInvite(inviteId: string): Promise<void>

  /** Histórico de convites de um paciente, para a ficha 360. */
  listInvites(
    clinicId: string,
    patientId: string,
  ): Promise<PortalInviteSummary[]>
}
