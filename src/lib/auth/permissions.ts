import type { MembershipRole } from '@/lib/supabase/database.types'

/**
 * Matriz papel × ação — feature **I-05** do roadmap.
 *
 * # Isto NÃO é a fronteira de segurança
 *
 * Precisa estar dito antes de qualquer outra coisa, porque a forma deste arquivo
 * convida ao erro oposto. Quem decide o que um papel pode fazer com uma linha é
 * a **RLS**, no banco — e o banco tem opinião própria e já escrita:
 * `can_access_clinical()`, `can_access_financial()`, `can_handle_billing()` e
 * `has_clinic_role()` são funções que existem no schema remoto.
 *
 * Esta matriz serve a duas coisas mais modestas:
 *
 *  1. **Recusar cedo, com mensagem boa.** Uma action que sabe que `finance` não
 *     cadastra paciente responde "você não tem permissão" em vez de deixar o
 *     Postgres devolver 42501 e a tela traduzir mal.
 *  2. **Não oferecer o que não funciona.** Botão que existe e sempre falha é
 *     pior que botão ausente.
 *
 * Se esta matriz e a RLS discordarem, **a RLS está certa e este arquivo está
 * errado** — nunca o contrário.
 *
 * # Pendência conhecida
 *
 * O corpo de `can_access_clinical()` e de `can_access_financial()` **não é
 * verificável a partir do repositório** (é o bloqueio B1: sem acesso SQL, sem
 * `DATABASE_URL`). A matriz abaixo foi escrita no recorte mais restritivo que
 * ainda deixa a clínica funcionar, porque errar para menos esconde um botão e
 * errar para mais oferece uma ação que a RLS recusa — e, em dado de saúde,
 * esconder é o erro barato.
 *
 * Reconciliar com:
 *
 * ```sql
 * select prosrc from pg_proc
 *  where proname in ('can_access_clinical','can_access_financial','can_handle_billing');
 * ```
 */

/**
 * Verbo de negócio, não nome de tabela.
 *
 * `record.read` aparece separado de `record.write` porque ler prontuário alheio
 * e escrever nele são riscos diferentes — e porque a leitura é auditada (§8 do
 * roadmap), a escrita é versionada.
 */
export type Permission =
  // Cadastro de pacientes
  | 'patient.read'
  | 'patient.write'
  | 'patient.archive'
  // Agenda
  | 'appointment.read'
  | 'appointment.write'
  | 'appointment.cancel'
  // Atendimento (check-in, fila, sinais vitais)
  | 'encounter.read'
  | 'encounter.write'
  // Prontuário — o dado mais sensível do produto
  | 'record.read'
  | 'record.write'
  // Financeiro
  | 'invoice.read'
  | 'invoice.write'
  | 'payment.write'
  | 'cash.manage'
  | 'payable.write'
  // Convênios
  | 'insurance.manage'
  // Equipe e clínica
  | 'team.read'
  | 'team.manage'
  | 'clinic.settings'
  // Relatórios
  | 'report.read'

const CLINICAL = [
  'record.read',
  'record.write',
  'encounter.read',
  'encounter.write',
] as const satisfies readonly Permission[]

const FRONT_DESK = [
  'patient.read',
  'patient.write',
  'patient.archive',
  'appointment.read',
  'appointment.write',
  'appointment.cancel',
  'encounter.read',
  'encounter.write',
] as const satisfies readonly Permission[]

const FINANCIAL = [
  'invoice.read',
  'invoice.write',
  'payment.write',
  'cash.manage',
  'payable.write',
  'insurance.manage',
] as const satisfies readonly Permission[]

/**
 * O que cada papel pode.
 *
 * Decisões que não são óbvias, e por quê:
 *
 *  - **`admin` não lê prontuário.** Administrar a clínica não é cuidar do
 *    paciente. Um administrativo que abre a evolução clínica de qualquer
 *    paciente é o cenário que a LGPD chama de acesso incompatível com a
 *    finalidade. `owner` mantém, porque em clínica pequena o dono é o
 *    responsável técnico — e a leitura é auditada de qualquer forma.
 *  - **`professional` escreve no cadastro**, mas não arquiva: arquivar é decisão
 *    administrativa sobre o vínculo, não sobre o cuidado.
 *  - **`finance` lê paciente.** Não é concessão: sem nome e documento não se
 *    emite fatura. O que ele não alcança é agenda, atendimento e prontuário.
 *  - **`receptionist` não vê valor nenhum.** Marcar consulta não exige saber
 *    quanto ela custa nem o que o paciente deve.
 */
const MATRIX: Record<MembershipRole, readonly Permission[]> = {
  owner: [
    ...FRONT_DESK,
    ...CLINICAL,
    ...FINANCIAL,
    'team.read',
    'team.manage',
    'clinic.settings',
    'report.read',
  ],

  admin: [
    ...FRONT_DESK,
    ...FINANCIAL,
    'team.read',
    'team.manage',
    'clinic.settings',
    'report.read',
  ],

  professional: [
    'patient.read',
    'patient.write',
    'appointment.read',
    'appointment.write',
    'appointment.cancel',
    ...CLINICAL,
    'team.read',
  ],

  receptionist: [...FRONT_DESK, 'team.read'],

  finance: ['patient.read', ...FINANCIAL, 'report.read'],
}

/**
 * Este papel pode esta ação?
 *
 * `null` (sessão sem papel na clínica ativa) é sempre `false` — ausência de
 * papel não é papel neutro.
 */
export function can(
  role: MembershipRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false

  return MATRIX[role]?.includes(permission) ?? false
}

/**
 * Papéis que têm a permissão — a forma que o `createAction` consome.
 *
 * Existe para que a lista de papéis de uma action seja DERIVADA da matriz, e
 * não uma segunda cópia escrita à mão que envelhece em silêncio.
 */
export function rolesWith(permission: Permission): readonly MembershipRole[] {
  return MEMBERSHIP_ROLES.filter((role) => can(role, permission))
}

/**
 * Todos os papéis do enum `membership_role` do banco.
 *
 * Escrito à mão, e não derivado de `Object.keys(MATRIX)`, porque é o que faz o
 * TypeScript quebrar quando um papel novo entrar no schema: `MATRIX` é um
 * `Record<MembershipRole, …>` e passa a exigir a entrada nova.
 */
export const MEMBERSHIP_ROLES: readonly MembershipRole[] = [
  'owner',
  'admin',
  'professional',
  'receptionist',
  'finance',
]
