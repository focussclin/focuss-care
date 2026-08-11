import type {
  ActivityEntry,
  Appointment,
  Patient,
  PatientNote,
  Professional,
} from '@/modules/_shared/domain/types'
import { addDays, startOfDay, startOfWeek } from '@/lib/utils/date'

/**
 * DADOS DE DEMONSTRACAO — temporarios.
 *
 * Existem para apresentar a interface enquanto o Supabase nao esta provisionado.
 * Sao a unica fonte de dados falsos do projeto: dashboard, agenda e pacientes leem
 * daqui, entao os numeros nunca se contradizem entre telas.
 *
 * Ao ligar o banco, estes exports somem e os repositorios de cada modulo assumem.
 * Nenhum componente precisa mudar — todos consomem os tipos de
 * modules/_shared/domain/types, nao este arquivo.
 */

/** Cria um horario a partir de um dia base. */
function at(base: Date, dayOffset: number, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const date = addDays(startOfDay(base), dayOffset)
  date.setHours(hours, minutes, 0, 0)
  return date
}

export const currentUser = {
  name: 'Tamara Vieira',
  role: 'Administradora',
} as const

export const professionals: readonly Professional[] = [
  { id: 'prof-1', name: 'Dra. Ana Ribeiro', specialty: 'Clínica geral' },
  { id: 'prof-2', name: 'Dr. Paulo Freitas', specialty: 'Ortopedia' },
  { id: 'prof-3', name: 'Dra. Helena Souza', specialty: 'Nutrição' },
] as const

/** Metricas do dashboard — valores exatos de DASHBOARD_DESIGN.md. */
/** Resumo rapido de pacientes — valores exatos de PATIENTS_DESIGN.md. */
export const patientMetrics = {
  total: 1284,
  newThisMonth: 36,
  pendingAppointments: 18,
} as const

export function getPatients(today: Date): Patient[] {
  return [
    {
      id: 'pat-1',
      name: 'Marina Costa',
      email: 'marina.costa@email.com',
      phone: '(11) 98812-4471',
      birthDate: new Date(1991, 2, 14),
      cpf: '32411890255',
      contactPreference: 'WhatsApp',
      status: 'active',
      createdAt: addDays(today, -420),
      lastVisitAt: addDays(today, -12),
      nextVisitAt: at(today, 0, '09:00'),
    },
    {
      id: 'pat-2',
      name: 'João Almeida',
      email: 'joao.almeida@email.com',
      phone: '(11) 99145-2280',
      birthDate: new Date(1985, 6, 2),
      contactPreference: 'Telefone',
      status: 'active',
      createdAt: addDays(today, -310),
      lastVisitAt: addDays(today, -30),
      nextVisitAt: at(today, 0, '15:30'),
    },
    {
      id: 'pat-3',
      name: 'Beatriz Nogueira',
      email: 'bia.nogueira@email.com',
      phone: '(21) 98770-1123',
      birthDate: new Date(1997, 10, 27),
      contactPreference: 'WhatsApp',
      status: 'follow-up',
      createdAt: addDays(today, -95),
      lastVisitAt: addDays(today, -5),
      nextVisitAt: at(today, 1, '10:30'),
    },
    {
      id: 'pat-4',
      name: 'Carlos Henrique Lima',
      email: 'carlos.lima@email.com',
      phone: '(11) 97432-8890',
      birthDate: new Date(1978, 0, 9),
      cpf: '88240133610',
      contactPreference: 'E-mail',
      status: 'active',
      createdAt: addDays(today, -640),
      lastVisitAt: addDays(today, -60),
      nextVisitAt: at(today, 2, '08:30'),
    },
    {
      id: 'pat-5',
      name: 'Fernanda Dias',
      email: 'fernanda.dias@email.com',
      phone: '(31) 99201-4478',
      birthDate: new Date(2001, 4, 22),
      contactPreference: 'WhatsApp',
      status: 'inactive',
      createdAt: addDays(today, -800),
      lastVisitAt: addDays(today, -190),
      nextVisitAt: null,
    },
    {
      id: 'pat-6',
      name: 'Roberto Salles',
      email: 'roberto.salles@email.com',
      phone: '(11) 98003-7712',
      birthDate: new Date(1966, 8, 30),
      contactPreference: 'Telefone',
      status: 'active',
      createdAt: addDays(today, -220),
      lastVisitAt: addDays(today, -21),
      nextVisitAt: at(today, 3, '14:00'),
    },
    {
      id: 'pat-7',
      name: 'Luiza Prado',
      email: 'luiza.prado@email.com',
      phone: '(48) 99618-2043',
      birthDate: new Date(1994, 11, 5),
      contactPreference: 'WhatsApp',
      status: 'follow-up',
      createdAt: addDays(today, -48),
      lastVisitAt: addDays(today, -3),
      nextVisitAt: at(today, 0, '11:00'),
    },
    {
      id: 'pat-8',
      name: 'Diego Martins',
      email: 'diego.martins@email.com',
      phone: '(11) 97788-3390',
      birthDate: new Date(1989, 3, 17),
      contactPreference: 'E-mail',
      status: 'active',
      createdAt: addDays(today, -150),
      lastVisitAt: addDays(today, -44),
      nextVisitAt: null,
    },
    {
      id: 'pat-9',
      name: 'Sofia Barreto',
      email: 'sofia.barreto@email.com',
      phone: '(11) 99560-8821',
      birthDate: new Date(2015, 1, 11),
      contactPreference: 'WhatsApp',
      status: 'active',
      createdAt: addDays(today, -26),
      lastVisitAt: addDays(today, -26),
      nextVisitAt: at(today, 1, '16:00'),
    },
    {
      id: 'pat-10',
      name: 'Antônio Vasconcelos',
      email: 'antonio.v@email.com',
      phone: '(85) 98114-6650',
      birthDate: new Date(1954, 5, 3),
      cpf: '11988720471',
      contactPreference: 'Telefone',
      status: 'inactive',
      createdAt: addDays(today, -930),
      lastVisitAt: addDays(today, -240),
      nextVisitAt: null,
    },
    {
      id: 'pat-11',
      name: 'Rafaela Monteiro',
      email: 'rafaela.monteiro@email.com',
      phone: '(11) 98330-2214',
      birthDate: new Date(1999, 7, 19),
      contactPreference: 'WhatsApp',
      status: 'active',
      createdAt: addDays(today, -18),
      lastVisitAt: null,
      nextVisitAt: at(today, 4, '09:30'),
    },
    {
      id: 'pat-12',
      name: 'Gustavo Peixoto',
      email: 'gustavo.peixoto@email.com',
      phone: '(51) 99447-1082',
      birthDate: new Date(1982, 9, 8),
      contactPreference: 'E-mail',
      status: 'active',
      createdAt: addDays(today, -365),
      lastVisitAt: addDays(today, -9),
      nextVisitAt: at(today, 0, '17:00'),
    },
  ]
}

export function getAppointments(today: Date): Appointment[] {
  const weekStart = startOfWeek(today)
  /** Deslocamento entre o inicio da semana e hoje, para preencher a grade. */
  const dayIndex = Math.round(
    (startOfDay(today).getTime() - weekStart.getTime()) / 86_400_000,
  )

  const build = (
    id: string,
    patientId: string,
    patientName: string,
    professionalId: string,
    professionalName: string,
    type: string,
    dayOffset: number,
    time: string,
    durationMinutes: number,
    status: Appointment['status'],
  ): Appointment => ({
    id,
    patientId,
    patientName,
    professionalId,
    professionalName,
    type,
    startsAt: at(weekStart, dayOffset, time),
    durationMinutes,
    status,
  })

  return [
    // ----- Hoje -----
    build('apt-1', 'pat-1', 'Marina Costa', 'prof-1', 'Dra. Ana Ribeiro', 'Consulta de rotina', dayIndex, '09:00', 30, 'completed'),
    build('apt-2', 'pat-7', 'Luiza Prado', 'prof-3', 'Dra. Helena Souza', 'Avaliação nutricional', dayIndex, '11:00', 60, 'confirmed'),
    build('apt-3', 'pat-2', 'João Almeida', 'prof-2', 'Dr. Paulo Freitas', 'Retorno', dayIndex, '15:30', 30, 'confirmed'),
    build('apt-4', 'pat-12', 'Gustavo Peixoto', 'prof-1', 'Dra. Ana Ribeiro', 'Primeira consulta', dayIndex, '17:00', 45, 'scheduled'),

    // ----- Restante da semana -----
    build('apt-5', 'pat-3', 'Beatriz Nogueira', 'prof-1', 'Dra. Ana Ribeiro', 'Acompanhamento', dayIndex + 1, '10:30', 30, 'confirmed'),
    build('apt-6', 'pat-9', 'Sofia Barreto', 'prof-3', 'Dra. Helena Souza', 'Consulta pediátrica', dayIndex + 1, '16:00', 45, 'scheduled'),
    build('apt-7', 'pat-4', 'Carlos Henrique Lima', 'prof-2', 'Dr. Paulo Freitas', 'Avaliação ortopédica', dayIndex + 2, '08:30', 60, 'confirmed'),
    build('apt-8', 'pat-6', 'Roberto Salles', 'prof-2', 'Dr. Paulo Freitas', 'Retorno', dayIndex + 3, '14:00', 30, 'scheduled'),
    build('apt-9', 'pat-11', 'Rafaela Monteiro', 'prof-1', 'Dra. Ana Ribeiro', 'Primeira consulta', dayIndex + 4, '09:30', 45, 'confirmed'),

    // ----- Dias anteriores da mesma semana -----
    build('apt-10', 'pat-8', 'Diego Martins', 'prof-1', 'Dra. Ana Ribeiro', 'Consulta de rotina', Math.max(dayIndex - 1, 0), '13:00', 30, 'completed'),
    build('apt-11', 'pat-5', 'Fernanda Dias', 'prof-3', 'Dra. Helena Souza', 'Retorno', Math.max(dayIndex - 2, 0), '10:00', 30, 'canceled'),
  ]
}

export function getRecentActivity(now: Date): ActivityEntry[] {
  return [
    {
      id: 'act-1',
      actorName: 'Marina Costa',
      description: 'teve o cadastro atualizado.',
      occurredAt: new Date(now.getTime() - 8 * 60_000),
    },
    {
      id: 'act-2',
      actorName: 'João Almeida',
      description: 'confirmou o atendimento das 15:30.',
      occurredAt: new Date(now.getTime() - 46 * 60_000),
    },
    {
      id: 'act-3',
      actorName: 'Dra. Ana',
      description: 'adicionou uma observação ao prontuário.',
      occurredAt: new Date(now.getTime() - 2 * 3_600_000),
    },
    {
      id: 'act-4',
      actorName: 'Luiza Prado',
      description: 'remarcou o atendimento para amanhã.',
      occurredAt: new Date(now.getTime() - 5 * 3_600_000),
    },
    {
      id: 'act-5',
      actorName: 'Dr. Paulo Freitas',
      description: 'concluiu o atendimento de Diego Martins.',
      occurredAt: new Date(now.getTime() - 26 * 3_600_000),
    },
  ]
}

export function getPatientNotes(today: Date): PatientNote[] {
  return [
    {
      id: 'note-1',
      authorName: 'Dra. Ana Ribeiro',
      content:
        'Paciente relatou melhora no quadro após ajuste da medicação. Manter acompanhamento mensal.',
      createdAt: addDays(today, -12),
    },
    {
      id: 'note-2',
      authorName: 'Recepção',
      content: 'Prefere contato por WhatsApp no período da tarde.',
      createdAt: addDays(today, -40),
    },
  ]
}
