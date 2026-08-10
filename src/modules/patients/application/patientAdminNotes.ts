/**
 * Observação administrativa do cadastro.
 *
 * Este texto não é prontuário clínico: ele vem de `patients.admin_notes` e só
 * deve ser exibido como informação administrativa da ficha 360.
 */
export function normalizePatientAdminNote(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}
