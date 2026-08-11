import type { StatusTone } from '@/components/ui/status-badge'
import type { BiologicalSex } from '@/lib/supabase/database.types'

/**
 * Contato de emergência — a quem avisar.
 *
 * Mora aqui, e não no domínio de pacientes, por causa da direção da dependência:
 * `Patient` é tipo compartilhado, e `_shared` não importa de módulo nenhum. As
 * REGRAS sobre o contato (o que o torna utilizável, como validá-lo) ficam em
 * `modules/patients/domain/PatientIdentity.ts`, que importa este tipo.
 *
 * `patients.emergency_contact` é `jsonb` sem forma declarada. A aplicação define
 * a forma e a relê na leitura — mesma disciplina de `workflows.trigger_config`.
 */
export interface EmergencyContact {
  name: string
  /** Somente dígitos (DDD + número), ou null. Ver `lib/utils/phone`. */
  phone: string | null
  /** 'Mãe', 'Cônjuge', 'Vizinha'. Texto livre — parentesco não tem enum útil. */
  relationship: string | null
}

/**
 * Endereço do paciente.
 *
 * Mora aqui pelo mesmo motivo de `EmergencyContact`: é campo de `Patient`, e
 * `_shared` não importa de módulo nenhum. As REGRAS — o que é endereço mínimo,
 * como se escreve um CEP, quais siglas de UF existem — ficam em
 * `modules/patients/domain/PatientDocuments.ts`.
 *
 * `patients.address` é `jsonb` **NOT NULL** e sem forma declarada. Até esta
 * fatia o insert gravava `{}` em toda linha da base: a coluna existia e nunca
 * teve conteúdo. A aplicação define a forma, fecha em Zod e a relê na leitura.
 *
 * Todo campo é anulável porque endereço chega pela metade no balcão — quem
 * marca consulta por telefone raramente sabe o CEP de cor. O que não pode é
 * ficar sem rua, cidade e UF ao mesmo tempo em que afirma ter endereço.
 */
export interface PatientAddress {
  /** Somente dígitos (8), ou null. A máscara é da tela. */
  zip: string | null
  street: string | null
  number: string | null
  complement: string | null
  district: string | null
  city: string | null
  /** Sigla da UF em maiúsculas: 'SP', 'MG'. */
  state: string | null
}

/**
 * Tipos de leitura compartilhados entre dashboard, agenda e pacientes.
 * As tres telas mostram as mesmas entidades sob recortes diferentes — manter isso
 * em um lugar so evita que cada tela invente o proprio formato.
 */

/** Espelha o enum `appointment_status` do banco remoto. */
export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'canceled'
  | 'no_show'

/**
 * O banco guarda apenas `patients.is_active`. 'follow-up' e um estado previsto
 * pelo handoff que ainda nao tem coluna correspondente — hoje so aparece nos dados
 * de demonstracao.
 */
export type PatientStatus = 'active' | 'inactive' | 'follow-up'

export interface Professional {
  id: string
  name: string
  specialty: string
}

export interface Patient {
  id: string
  /** `patients.full_name` — o nome de registro, o do documento. */
  name: string
  /**
   * `patients.social_name` — como a pessoa é chamada.
   *
   * Não é apelido: quando existe, VENCE o nome de registro em toda exibição.
   * Quem decide isso é `preferredName`, no domínio de pacientes — espalhar
   * `socialName ?? name` pelas telas é como uma delas acaba chamando alguém pelo
   * nome errado na sala de espera.
   */
  socialName?: string | null
  email: string
  phone: string
  /** `patients.phone_alt` — segundo número, já formatado. */
  phoneAlt?: string
  /** `patients.biological_sex`. Uso clínico; distinto de `genderIdentity`. */
  biologicalSex?: BiologicalSex
  /** `patients.gender_identity` — autodeclarada, texto livre. */
  genderIdentity?: string | null
  /** `patients.emergency_contact`, já validado contra a forma fechada. */
  emergencyContact?: EmergencyContact | null
  /**
   * A coluna tinha conteúdo que NÃO casou com a forma esperada.
   *
   * Só acontece com linha escrita fora do produto. Existe para a ficha poder
   * avisar que salvar vai substituir o que está lá, em vez de mostrar "sem
   * contato" sobre um dado que existe.
   */
  emergencyContactUnreadable?: boolean
  /** Null quando a data de nascimento nao foi informada no cadastro. */
  birthDate: Date | null
  /**
   * `patients.cpf` — **somente dígitos**, já validado pelo dígito verificador.
   *
   * Antes chamava-se `document` e era só leitura: a coluna aparecia na ficha e
   * nenhuma escrita do produto a preenchia. Dois nomes para a mesma coluna é
   * como uma tela passa a mostrar um valor que outra não sabe atualizar.
   */
  cpf?: string | null
  /** `patients.cns` — Cartão Nacional de Saúde, somente dígitos (15). */
  cns?: string | null
  /** `patients.address`, já validado contra a forma fechada. */
  address?: PatientAddress | null
  /**
   * A coluna `address` tinha conteúdo que NÃO casou com a forma esperada.
   *
   * Mesmo papel de `emergencyContactUnreadable`: só acontece com linha escrita
   * fora do produto, e existe para a ficha avisar que salvar vai substituir o
   * que está lá, em vez de mostrar "sem endereço" sobre um dado que existe.
   */
  addressUnreadable?: boolean
  /** Opcional: o schema remoto ainda nao tem coluna de preferencia de contato. */
  contactPreference?: 'WhatsApp' | 'Telefone' | 'E-mail'
  /**
   * `patients.admin_notes` — observacao ADMINISTRATIVA do cadastro.
   *
   * Nao e prontuario nem nota clinica: essas moram em `records`, com versionamento
   * e auditoria de leitura proprios (F5 do roadmap). Existe aqui porque o
   * formulario de edicao precisa carregar o valor atual — sem ele, salvar o
   * formulario apagaria a observacao ja gravada.
   */
  adminNotes?: string | null
  status: PatientStatus
  createdAt: Date
  lastVisitAt: Date | null
  nextVisitAt: Date | null
}

export interface Appointment {
  id: string
  patientId: string
  patientName: string
  professionalId: string
  professionalName: string
  type: string
  startsAt: Date
  /** Duracao em minutos. */
  durationMinutes: number
  status: AppointmentStatus
  notes?: string
  /**
   * Sala reservada, quando há uma.
   *
   * **Opcional por construção, e isso é a feature.** Clínica que não controla
   * sala continua marcando como sempre: `appointments.room_id` nasce nulo, e
   * todo atendimento criado antes desta fatia permanece válido. A constraint de
   * sobreposição por sala é `where room_id is not null`, então ela nem chega a
   * ser avaliada para eles.
   *
   * Tornar obrigatório exigiria uma sala cadastrada para marcar qualquer
   * consulta — e a migration de salas nem está aplicada.
   */
  roomId?: string | null
  /** Nome da sala, do join. Ausente quando não há sala ou o join não veio. */
  roomName?: string | null
}

export interface ActivityEntry {
  id: string
  actorName: string
  /** Texto que segue o nome: "teve o cadastro atualizado." */
  description: string
  occurredAt: Date
}

export interface PatientNote {
  id: string
  authorName: string
  content: string
  createdAt: Date
}

/** Rotulo e tom visual de cada status, em um unico lugar. */
export const appointmentStatusMeta: Record<
  AppointmentStatus,
  { label: string; tone: StatusTone }
> = {
  scheduled: { label: 'Agendado', tone: 'pending' },
  confirmed: { label: 'Confirmado', tone: 'positive' },
  checked_in: { label: 'Aguardando', tone: 'pending' },
  in_progress: { label: 'Em atendimento', tone: 'positive' },
  completed: { label: 'Concluído', tone: 'neutral' },
  canceled: { label: 'Cancelado', tone: 'negative' },
  no_show: { label: 'Faltou', tone: 'negative' },
}

export const patientStatusMeta: Record<
  PatientStatus,
  { label: string; tone: StatusTone }
> = {
  active: { label: 'Ativo', tone: 'positive' },
  inactive: { label: 'Inativo', tone: 'neutral' },
  'follow-up': { label: 'Acompanhamento', tone: 'pending' },
}
