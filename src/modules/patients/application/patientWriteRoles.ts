import type { MembershipRole } from '@/lib/supabase/database.types'

/**
 * Quem escreve no cadastro de pacientes: criar, editar e arquivar.
 *
 * `finance` fica de fora — o papel existe para faturamento, e cadastro e ato de
 * recepcao. As tres actions compartilham a mesma lista de proposito: separar
 * "pode criar" de "pode editar" sem regra de negocio que justifique seria inventar
 * politica.
 *
 * Provisorio: a matriz papel x acao centralizada e a feature I-05 do roadmap.
 * Quando ela existir, este arquivo some e as actions passam a consultar
 * `lib/auth/permissions.ts`.
 *
 * Vive fora de `actions/` porque um modulo `'use server'` so pode exportar funcao
 * async — constante exportada de la nao compila.
 */
export const patientWriteRoles: readonly MembershipRole[] = [
  'owner',
  'admin',
  'receptionist',
  'professional',
]
