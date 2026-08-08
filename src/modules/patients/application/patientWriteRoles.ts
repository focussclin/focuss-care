import { rolesWith } from '@/lib/auth/permissions'
import type { MembershipRole } from '@/lib/supabase/database.types'

/**
 * Quem escreve no cadastro de pacientes.
 *
 * Desde I-05 a lista é **derivada da matriz** (`lib/auth/permissions.ts`), não
 * escrita à mão aqui. Era o que este arquivo prometia: uma segunda cópia da
 * política, escrita em outro lugar, envelhece em silêncio — muda-se a matriz e
 * a action continua com a lista antiga, sem nada quebrar.
 *
 * O resultado é o mesmo de antes de I-05 (owner, admin, receptionist,
 * professional), então esta fatia **não muda comportamento**.
 *
 * Vive fora de `actions/` porque um módulo `'use server'` só pode exportar
 * função async — constante exportada de lá não compila.
 *
 * ## Follow-up declarado
 *
 * As três actions (criar, editar, arquivar) ainda compartilham esta lista. A
 * matriz já separa `patient.write` de `patient.archive` — arquivar é decisão
 * administrativa sobre o vínculo, não sobre o cuidado, e por isso `professional`
 * não a tem. Aplicar a separação exige editar as três actions, que estão abertas
 * por outro agente (F-02) neste worktree. Fica para o commit seguinte, com o
 * comportamento de hoje preservado até lá.
 */
export const patientWriteRoles: readonly MembershipRole[] =
  rolesWith('patient.write')
