import type { MembershipRole } from '@/lib/supabase/database.types'

/** Espelha o enum `membership_status` do banco. */
export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked'

/**
 * Alguém com vínculo nesta clínica.
 *
 * # Três entidades diferentes, e confundi-las custa caro
 *
 *  - **`memberships`** — o vínculo de ACESSO: quem entra no sistema e com que
 *    papel. É o que esta fatia gerencia.
 *  - **`professionals`** — quem ATENDE: conselho, registro, especialidade. Nem
 *    todo membro é profissional (a recepção não é), e é por isso que só
 *    profissional assina prontuário (R-01).
 *  - **`employees`** — o vínculo TRABALHISTA, de onde pendem escalas e
 *    ausências. O produto ainda não o modela.
 *
 * Um `TeamMember` é a primeira, com a segunda anexada quando existe.
 */
export interface TeamMember {
  /** `memberships.id` — o alvo das operações desta fatia. */
  id: string
  userId: string
  name: string
  email: string
  role: MembershipRole
  status: MembershipStatus
  /** Preenchido quando a pessoa também tem cadastro de profissional. */
  professional: {
    id: string
    specialties: readonly string[]
  } | null
  acceptedAt: Date | null
  createdAt: Date
}

/**
 * Convite emitido e ainda não aceito.
 *
 * O token cru nunca faz parte desta entidade. Ele só existe no retorno da RPC
 * de emissão e é entregue uma única vez para que a aplicação monte o link.
 */
export interface PendingInvitation {
  id: string
  email: string
  role: MembershipRole
  expiresAt: Date
  createdAt: Date
}

/**
 * Resultado da emissão. O token só atravessa o caso de uso uma vez e nunca é
 * persistido, listado ou enviado para auditoria.
 */
export interface CreatedInvitation {
  token: string
  expiresAt: Date
}
